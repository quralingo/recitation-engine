require 'xcodeproj'
require_relative '../ios/spm'
project = Xcodeproj::Project.new('/tmp/quralingo-recitation-spm-test.xcodeproj')
target = project.new_target(:framework, 'QuralingoRecitation', :ios, '15.1')
installer = Struct.new(:pods_project).new(project)
quralingo_recitation_spm(installer)
project.root_object.package_references.clear # Simulate RN post_install cleanup.
quralingo_recitation_spm(installer)
quralingo_recitation_spm(installer)
raise 'duplicate reference' unless project.root_object.package_references.size == 1
raise 'duplicate product' unless target.package_product_dependencies.size == 1
ref = project.root_object.package_references.first
raise 'wrong pin' unless ref.requirement == { 'kind' => 'exactVersion', 'version' => '4.0.3' }
raise 'missing framework product' unless target.frameworks_build_phase.files.any? { |f| f.product_ref&.product_name == 'TajweedFormer' }
raise 'orphaned package product' unless target.package_product_dependencies.first.package == ref
raise 'missing module path' unless target.build_configurations.all? { |c| c.build_settings['SWIFT_INCLUDE_PATHS'].include?('${SYMROOT}/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}/') }
project.save
Xcodeproj::Project.open(project.path)
puts 'SPM project wiring and idempotence passed'
