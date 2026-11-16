require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'QuralingoRecitation'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://github.com/quralingo/recitation-engine'
  s.license = { :type => 'NPL-1.2', :file => 'LICENSE' }
  s.author = { 'Quralingo' => 'https://quranlingo.app' }
  s.source = { :git => 'https://github.com/quralingo/recitation-engine.git', :tag => s.version.to_s }
  s.platform = :ios, '15.1'
  s.source_files = 'ios/*.{swift,m}'
  s.swift_version = '5.0'
  s.dependency 'React-Core'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_STRICT_CONCURRENCY' => 'minimal' }
end
