# Offline build fixture for the link arrangement, not a Quran Lab SDK/device test.
require 'xcodeproj'
require 'tmpdir'
require 'fileutils'
require_relative '../ios/spm'

root = Dir.mktmpdir('recitation-spm-link-')
FileUtils.mkdir_p(File.join(root, 'FixtureSDK', 'Sources', 'CProbe', 'include'))
FileUtils.mkdir_p(File.join(root, 'FixtureSDK', 'Sources', 'TajweedFormer'))
File.write(File.join(root, 'FixtureSDK', 'Package.swift'), <<~SWIFT)
  // swift-tools-version: 5.9
  import PackageDescription
  let package = Package(name: "FixtureSDK", platforms: [.iOS(.v15)],
    products: [.library(name: "TajweedFormer", targets: ["TajweedFormer"])],
    targets: [.target(name: "CProbe"), .target(name: "TajweedFormer", dependencies: ["CProbe"], resources: [.copy("probe.txt")])])
SWIFT
File.write(File.join(root, 'FixtureSDK', 'Sources', 'CProbe', 'include', 'CProbe.h'), 'int recitation_core_probe(void);')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'CProbe', 'CProbe.c'), 'int recitation_core_probe(void) { return 7; }')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'TajweedFormer', 'probe.txt'), 'resource-probe')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'TajweedFormer', 'Probe.swift'), <<~SWIFT)
  import Foundation
  import CProbe
  public enum SDKProbe {
    public static func value() -> String {
      return String(recitation_core_probe()) + (try! String(contentsOf: Bundle.module.url(forResource: "probe", withExtension: "txt")!))
    }
  }
SWIFT
File.write(File.join(root, 'Bridge.swift'), "import TajweedFormer\npublic enum RecitationProbe { public static func value() -> String { SDKProbe.value() } }\n")
File.write(File.join(root, 'main.swift'), "import QuralingoRecitation\nprint(RecitationProbe.value())\n")
project = Xcodeproj::Project.new(File.join(root, 'Fixture.xcodeproj'))
pod = project.new_target(:framework, 'QuralingoRecitation', :ios, '15.1')
app = project.new_target(:application, 'FixtureApp', :ios, '15.1')
pod.source_build_phase.add_file_reference(project.main_group.new_file('Bridge.swift'))
app.source_build_phase.add_file_reference(project.main_group.new_file('main.swift'))
pod.build_configurations.each { |c| c.build_settings['MACH_O_TYPE'] = 'staticlib' }
[pod, app].each do |target|
  target.build_configurations.each do |config|
    config.build_settings.merge!('SWIFT_VERSION' => '5.0', 'DEFINES_MODULE' => 'YES',
      'GENERATE_INFOPLIST_FILE' => 'YES', 'CODE_SIGNING_ALLOWED' => 'NO',
      'PRODUCT_BUNDLE_IDENTIFIER' => "com.quralingo.fixture.#{target.name}")
  end
end
app.add_dependency(pod)
app.frameworks_build_phase.add_file_reference(pod.product_reference)
pod_info = Struct.new(:pod_name).new('QuralingoRecitation')
aggregate = Struct.new(:pod_targets, :user_project, :user_targets).new([pod_info], project, [app])
installer = Struct.new(:pods_project, :aggregate_targets).new(project, [aggregate])
quralingo_recitation_spm(installer)
# Substitute an offline local SPM product with Swift, C and resources for the
# remote SDK. Only test fixture references are changed, never the shipped helper.
remote = project.root_object.package_references.first
local = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
local.relative_path = 'FixtureSDK'
project.root_object.package_references.delete(remote)
project.root_object.package_references << local
[pod, app].each { |t| t.package_product_dependencies.each { |p| p.package = local if p.package == remote } }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.save_as(project.path, 'FixtureApp', true)
log = File.join(root, 'build.log')
puts "Building offline static-link fixture; log: #{log}"
cache = File.join(root, 'Cache')
FileUtils.mkdir_p(cache)
ok = system({ 'CLANG_MODULE_CACHE_PATH' => File.join(cache, 'Clang'),
  'SWIFTPM_MODULECACHE_OVERRIDE' => File.join(cache, 'SwiftPMModules'), 'XDG_CACHE_HOME' => cache },
  'xcodebuild', '-project', project.path.to_s, '-scheme', 'FixtureApp',
  '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
  '-derivedDataPath', File.join(root, 'DerivedData'), '-packageCachePath', File.join(cache, 'Packages'),
  'CODE_SIGNING_ALLOWED=NO', 'build', out: log, err: [:child, :out])
unless ok
  warn File.readlines(log).grep(/error:|failed|BUILD FAILED/).last(15).join
  abort 'Offline static-link fixture did not build; inspect the log above'
end
product = Dir.glob(File.join(root, 'DerivedData', 'Build', 'Products', '*', 'FixtureApp.app')).first
raise 'SPM resource bundle did not reach the app' unless product && Dir.glob(File.join(product, '**', 'probe.txt')).any?
symbols = IO.popen(['xcrun', 'nm', '-g', File.join(product, 'FixtureApp')], &:read)
raise 'C SDK symbol must link exactly once' unless symbols.lines.count { |line| line.match?(/\b[Tt] _recitation_core_probe$/) } == 1
puts 'Offline fixture compiled/linked once and packaged its SPM resource bundle'
