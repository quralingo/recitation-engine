require 'xcodeproj'
require 'tmpdir'
require 'fileutils'
require_relative '../ios/spm'

PodInfo = Struct.new(:pod_name, :label, :static) do
  def build_as_static?; self.static; end
end
AggregateInfo = Struct.new(:pod_targets, :user_project, :user_targets)
InstallerInfo = Struct.new(:pods_project, :pod_targets, :aggregate_targets)

def assert(value, message)
  raise message unless value
end

Dir.mktmpdir('recitation-static-tests-') do |dir|
  pods = Xcodeproj::Project.new(File.join(dir, 'Pods.xcodeproj'))
  target = pods.new_target(:framework, 'QuralingoRecitation', :ios, '15.1')
  target.build_configurations.each { |c| c.build_settings['MACH_O_TYPE'] = 'staticlib' }
  info = PodInfo.new('QuralingoRecitation', 'QuralingoRecitation', true)
  other_info = PodInfo.new('OtherPod', 'OtherPod', true)
  app = Xcodeproj::Project.new(File.join(dir, 'App.xcodeproj'))
  phone = app.new_target(:application, 'Phone', :ios, '15.1')
  tablet = app.new_target(:application, 'Tablet', :ios, '15.1')
  unrelated = app.new_target(:application, 'Unrelated', :ios, '15.1')
  phone.build_configurations.each { |c| c.build_settings['OTHER_LDFLAGS'] = ['$(inherited)', '-ObjC'] }
  settings_before = target.build_configurations.map { |c| c.build_settings.dup }
  linker_before = phone.build_configurations.map { |c| c.build_settings['OTHER_LDFLAGS'].dup }
  installer = InstallerInfo.new(pods, [info], [
    AggregateInfo.new([info], app, [phone, tablet]),
    AggregateInfo.new([info], app, [phone]), # Duplicate consumer is deduplicated.
    AggregateInfo.new([other_info], app, [unrelated]),
  ])
  # Exact beta.3 graph: product dependency in pod (archives SDK even without phase
  # entry), plus direct product/link in the apps. beta.4 must remove the latter.
  QuralingoRecitationSPM.attach(pods, target, link: false)
  [phone, tablet].each { |t| QuralingoRecitationSPM.attach(app, t, link: true) }
  # Migrate duplicate beta.4 phases without touching unrelated target scripts.
  [phone, tablet].each do |consumer|
    2.times do
      phase = consumer.new_shell_script_build_phase(QuralingoRecitationSPM::RESOURCE_PHASE)
      phase.output_paths = ['${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/TajweedFormer_TajweedFormer.bundle']
    end
  end
  other_phase = unrelated.new_shell_script_build_phase(QuralingoRecitationSPM::RESOURCE_PHASE)
  quralingo_recitation_spm(installer)
  pods.root_object.package_references.clear
  app.root_object.package_references.clear
  2.times { quralingo_recitation_spm(installer) }
  assert(target.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'Keep static pod archive graph: product dependency alone archives SDK')
  [phone, tablet].each do |consumer|
    assert(consumer.package_product_dependencies.empty?, 'No direct SDK product on consuming app')
    assert(consumer.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'No second SDK link on consuming app')
    phases = consumer.shell_script_build_phases.select { |p| p.name == QuralingoRecitationSPM::RESOURCE_PHASE }
    assert(phases.empty?, 'Xcode must be the only SDK resource producer; remove all beta.4 phases')
    embeds = consumer.copy_files_build_phases.select { |p| p.name == QuralingoRecitationSPM::EMBED_PHASE }
    assert(embeds.size == 1 && embeds.first.files.size == 1, 'Embed Core exactly once after repeated installs')
    embed = embeds.first
    file = embed.files.first
    assert(embed.dst_subfolder_spec == '10' && embed.dst_path == '', 'Embed in app Frameworks directory')
    assert(file.file_ref.path == 'QuranLabCore.framework' && file.file_ref.source_tree == 'BUILT_PRODUCTS_DIR', 'Use the platform-selected SPM framework')
    assert(file.settings['ATTRIBUTES'].sort == ['CodeSignOnCopy', 'RemoveHeadersOnCopy'].sort, 'Use normal Xcode embedding and signing')
  end
  assert(unrelated.shell_script_build_phases.include?(other_phase), 'Unrelated target scripts are preserved')
  assert(unrelated.package_product_dependencies.empty?, 'Unrelated target must stay untouched')
  assert(unrelated.copy_files_build_phases.none? { |p| p.name == QuralingoRecitationSPM::EMBED_PHASE }, 'Do not embed Core in unrelated apps')
  assert(unrelated.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'Unrelated target must not link SDK')
  assert(pods.root_object.package_references.size == 1 && app.root_object.package_references.empty?, 'SDK owned only by pod project')
  assert(target.package_product_dependencies.size == 1, 'Static pod still needs SDK compile dependency')
  assert(target.build_configurations.all? { |c| c.build_settings['MACH_O_TYPE'] == 'staticlib' }, 'Preserve static linkage')
  assert(phone.build_configurations.map { |c| c.build_settings['OTHER_LDFLAGS'] } == linker_before, 'Do not change ObjC linker flags')
  target.build_configurations.each_with_index do |c, i|
    settings_before[i].each { |k, v| assert(c.build_settings[k] == v, "Unrelated pod setting changed: #{k}") unless k == 'SWIFT_INCLUDE_PATHS' }
  end
  reopened = Xcodeproj::Project.open(app.path)
  saved = reopened.targets.find { |t| t.name == 'Phone' }
  assert(saved.package_product_dependencies.empty? && saved.shell_script_build_phases.none? { |p| p.name == QuralingoRecitationSPM::RESOURCE_PHASE }, 'Persist migrated host and resources')
  assert(saved.copy_files_build_phases.any? { |p| p.name == QuralingoRecitationSPM::EMBED_PHASE && p.files.size == 1 }, 'Persist Core embedding')
  # Also support use_frameworks disabled (plain static-library pods).
  library_project = Xcodeproj::Project.new(File.join(dir, 'StaticLibraryPods.xcodeproj'))
  library = library_project.new_target(:static_library, 'QuralingoRecitation', :ios, '15.1')
  quralingo_recitation_spm(InstallerInfo.new(library_project, [], [AggregateInfo.new([info], app, [phone])]))
  assert(library.package_product_dependencies.size == 1 && library.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'Plain static library owns SDK via product dependency')
  # Fail before touching projects if CocoaPods cannot identify consumers.
  empty = Xcodeproj::Project.new(File.join(dir, 'MissingHost.xcodeproj'))
  empty.new_target(:static_library, 'QuralingoRecitation', :ios, '15.1')
  begin
    quralingo_recitation_spm(InstallerInfo.new(empty, [], []))
    raise 'Expected missing-host error'
  rescue RuntimeError => error
    assert(error.message.include?('consuming user target'), 'Actionable missing-host diagnostic')
  end
  assert(empty.root_object.package_references.empty?, 'Failed setup must not partially mutate project')

end
puts 'Static SDK ownership, beta.3 migration, scoping, idempotence and beta.4 resource-producer migration passed'
