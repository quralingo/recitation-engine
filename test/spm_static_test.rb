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
  quralingo_recitation_spm(installer)
  pods.root_object.package_references.clear
  app.root_object.package_references.clear
  2.times { quralingo_recitation_spm(installer) }
  assert(target.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'Keep static pod archive graph: product dependency alone archives SDK')
  [phone, tablet].each do |consumer|
    assert(consumer.package_product_dependencies.empty?, 'No direct SDK product on consuming app')
    assert(consumer.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'No second SDK link on consuming app')
    phases = consumer.shell_script_build_phases.select { |p| p.name == QuralingoRecitationSPM::RESOURCE_PHASE }
    assert(phases.size == 1, 'Exactly one resource-copy phase per consumer')
    assert(phases.first.input_paths.first.end_with?('TajweedFormer_TajweedFormer.bundle'), 'SPM resource input')
    assert(phases.first.output_paths.first.include?('UNLOCALIZED_RESOURCES_FOLDER_PATH'), 'App resource output')
  end
  assert(unrelated.package_product_dependencies.empty?, 'Unrelated target must stay untouched')
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
  assert(saved.package_product_dependencies.empty? && saved.shell_script_build_phases.any? { |p| p.name == QuralingoRecitationSPM::RESOURCE_PHASE }, 'Persist migrated host and resources')
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
  # Execute the actual generated phase, not a reimplementation of its copy logic.
  resources = File.join(dir, 'Products', QuralingoRecitationSPM::RESOURCE_BUNDLE)
  FileUtils.mkdir_p(File.join(resources, 'Errors'))
  File.write(File.join(resources, 'PrivacyInfo.xcprivacy'), 'privacy-probe')
  File.write(File.join(resources, 'Errors', 'en.json'), '{"probe":true}')
  phase = phone.shell_script_build_phases.find { |p| p.name == QuralingoRecitationSPM::RESOURCE_PHASE }
  environment = {'PROJECT_DIR' => app.path.dirname.to_s, 'BUILT_PRODUCTS_DIR' => File.dirname(resources),
    'TARGET_BUILD_DIR' => File.join(dir, 'App Build'), 'UNLOCALIZED_RESOURCES_FOLDER_PATH' => 'Phone.app'}
  2.times { assert(system(environment, '/bin/sh', '-c', phase.shell_script), 'Generated resource phase must execute') }
  copied = File.join(environment['TARGET_BUILD_DIR'], 'Phone.app', QuralingoRecitationSPM::RESOURCE_BUNDLE)
  assert(File.read(File.join(copied, 'PrivacyInfo.xcprivacy')) == 'privacy-probe', 'Preserve privacy manifest contents')
  assert(File.read(File.join(copied, 'Errors', 'en.json')) == '{"probe":true}', 'Preserve nested resources')
end
puts 'Static SDK ownership, beta.3 migration, scoping, idempotence and executed resource-copy phase passed'
