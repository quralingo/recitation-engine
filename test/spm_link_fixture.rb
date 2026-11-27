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
  let package = Package(name: "TajweedFormer", platforms: [.iOS(.v15)],
    products: [.library(name: "TajweedFormer", targets: ["TajweedFormer"])],
    targets: [.target(name: "CProbe"), .target(name: "TajweedFormer", dependencies: ["CProbe"], resources: [.copy("probe.txt"), .copy("PrivacyInfo.xcprivacy")])])
SWIFT
File.write(File.join(root, 'FixtureSDK', 'Sources', 'CProbe', 'include', 'CProbe.h'), 'int recitation_core_probe(void);')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'CProbe', 'CProbe.c'), 'int recitation_core_probe(void) { return 7; }')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'TajweedFormer', 'probe.txt'), 'resource-probe')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'TajweedFormer', 'PrivacyInfo.xcprivacy'), '<?xml version="1.0"?><plist version="1.0"><dict/></plist>')
File.write(File.join(root, 'FixtureSDK', 'Sources', 'TajweedFormer', 'Probe.swift'), <<~SWIFT)
  import Foundation
  import CProbe
  public enum SDKProbe {
    public static func value() -> String {
      return String(recitation_core_probe()) + (try! String(contentsOf: Bundle.module.url(forResource: "probe", withExtension: "txt")!))
    }
  }
SWIFT
official = ARGV.include?('--official-sdk')
bridge_value = official ? 'String(describing: TajweedSessionOptions())' : 'SDKProbe.value()'
File.write(File.join(root, 'Bridge.swift'), "import TajweedFormer\npublic enum RecitationProbe { public static func value() -> String { #{bridge_value} } }\n")
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
# Negative control: retaining the product on both targets is precisely beta.3.
QuralingoRecitationSPM.attach(project, app, link: true) if ARGV.include?('--reproduce-beta3')
# Substitute an offline local SPM product with Swift, C and resources for the
# remote SDK. Only test fixture references are changed, never the shipped helper.
unless official
  # The lightweight offline fixture has no dynamic binary dependency.
  app.copy_files_build_phases.select { |p| p.name == QuralingoRecitationSPM::EMBED_PHASE }.each(&:remove_from_project)
  remote = project.root_object.package_references.first
  local = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
  local.relative_path = 'FixtureSDK'
  project.root_object.package_references.delete(remote)
  project.root_object.package_references << local
  [pod, app].each { |t| t.package_product_dependencies.each { |p| p.package = local if p.package == remote } }
end
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
  '-configuration', ARGV.include?('--device') ? 'Release' : 'Debug',
  '-sdk', ARGV.include?('--device') ? 'iphoneos' : 'iphonesimulator',
  '-destination', ARGV.include?('--device') ? 'generic/platform=iOS' : 'generic/platform=iOS Simulator',
  '-derivedDataPath', File.join(root, 'DerivedData'), '-packageCachePath', File.join(cache, 'Packages'),
  'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', 'CODE_SIGNING_ALLOWED=NO', 'build', out: log, err: [:child, :out])
unless ok
  if ARGV.include?('--reproduce-beta3') && File.read(log).include?('duplicate symbol')
    puts 'Reproduced beta.3 duplicate-symbol link failure'
    exit 0
  end
  warn File.readlines(log).grep(/error:|failed|BUILD FAILED/).last(15).join
  abort 'Offline static-link fixture did not build; inspect the log above'
end
raise 'Beta.3 negative control unexpectedly linked' if ARGV.include?('--reproduce-beta3')
archive = Dir.glob(File.join(root, 'DerivedData', 'Build', 'Products', '**', 'QuralingoRecitation.framework', 'QuralingoRecitation')).first
raise 'Static archive not built' unless archive
members = IO.popen(['xcrun', 'ar', '-t', archive], &:read).lines.map(&:strip)
raise 'SDK must be archived once by the pod' unless members.count('TajweedFormer.o') == 1 && members.count(official ? 'COpus.o' : 'CProbe.o') == 1
product = Dir.glob(File.join(root, 'DerivedData', 'Build', 'Products', '*', 'FixtureApp.app')).first
raise 'SPM resource bundle did not reach the app' unless product && (official || Dir.glob(File.join(product, '**', 'probe.txt')).any?)
raise 'SDK privacy manifest did not reach the app' unless Dir.glob(File.join(product, '**', 'PrivacyInfo.xcprivacy')).any?
if official
  core = File.join(product, 'Frameworks', 'QuranLabCore.framework', 'QuranLabCore')
  raise 'Dynamic QuranLabCore did not reach the app' unless File.file?(core)
  raise 'Embedded Core is not a dynamic library' unless IO.popen(['xcrun', 'otool', '-hv', core], &:read).include?('DYLIB')
end
images = [File.join(product, 'FixtureApp')] + Dir.glob(File.join(product, '*.debug.dylib'))
symbols = images.map { |image| IO.popen(['xcrun', 'nm', '-g', image], &:read) }.join("\n")
symbol = official ? '_opus_encode_float' : '_recitation_core_probe'
raise 'C SDK symbol must link exactly once' unless symbols.lines.count { |line| line.split.last == symbol } == 1
puts 'Static fixture compiled; SDK archive members and final symbol occur once; SDK resources/privacy reached app'
