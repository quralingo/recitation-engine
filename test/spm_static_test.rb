require 'xcodeproj'
require 'tmpdir'
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
  # Simulate beta.2: SDK linked into the pod. The new helper must remove that link.
  QuralingoRecitationSPM.attach(pods, target, link: true)
  quralingo_recitation_spm(installer)
  pods.root_object.package_references.clear
  app.root_object.package_references.clear
  2.times { quralingo_recitation_spm(installer) }
  assert(target.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'SDK must not be archived into static pod')
  [phone, tablet].each do |consumer|
    assert(consumer.package_product_dependencies.size == 1, 'One SDK dependency per app')
    assert(consumer.frameworks_build_phase.files.count { |f| QuralingoRecitationSPM.our_product?(f.product_ref) } == 1, 'SDK must link exactly once in each consumer')
    assert(app.root_object.package_references.include?(consumer.package_product_dependencies.first.package), 'Repaired host package reference')
  end
  assert(unrelated.package_product_dependencies.empty?, 'Unrelated target must stay untouched')
  assert(unrelated.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'Unrelated target must not link SDK')
  assert(pods.root_object.package_references.size == 1 && app.root_object.package_references.size == 1, 'One package ref per project')
  assert(target.package_product_dependencies.size == 1, 'Static pod still needs SDK compile dependency')
  assert(target.build_configurations.all? { |c| c.build_settings['MACH_O_TYPE'] == 'staticlib' }, 'Preserve static linkage')
  assert(phone.build_configurations.map { |c| c.build_settings['OTHER_LDFLAGS'] } == linker_before, 'Do not change ObjC linker flags')
  target.build_configurations.each_with_index do |c, i|
    settings_before[i].each { |k, v| assert(c.build_settings[k] == v, "Unrelated pod setting changed: #{k}") unless k == 'SWIFT_INCLUDE_PATHS' }
  end
  reopened = Xcodeproj::Project.open(app.path)
  assert(reopened.targets.find { |t| t.name == 'Phone' }.package_product_dependencies.size == 1, 'Persist host changes in post_install')
  # Also support use_frameworks disabled (plain static-library pods).
  library_project = Xcodeproj::Project.new(File.join(dir, 'StaticLibraryPods.xcodeproj'))
  library = library_project.new_target(:static_library, 'QuralingoRecitation', :ios, '15.1')
  quralingo_recitation_spm(InstallerInfo.new(library_project, [], [AggregateInfo.new([info], app, [phone])]))
  assert(library.frameworks_build_phase.files.none? { |f| QuralingoRecitationSPM.our_product?(f.product_ref) }, 'Plain static library must be compile-only')
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
puts 'Static framework/library, host linkage, migration, scoping and idempotence passed'
