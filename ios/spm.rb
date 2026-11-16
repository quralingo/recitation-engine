# CocoaPods does not resolve Swift Package Manager products. Call this in post_install,
# AFTER react_native_post_install. It adds the SDK to this pod target, pinned exactly.
def quralingo_recitation_spm(installer)
  project = installer.pods_project
  target = project.targets.find { |t| t.name == 'QuralingoRecitation' }
  raise 'QuralingoRecitation pod target not found' unless target
  # Static pods do not reliably propagate SPM binary linkage to the host app.
  # Require a dynamic framework for this initial supported integration path.
  unless target.product_type == 'com.apple.product-type.framework' &&
      target.build_configurations.all? { |c| c.build_settings['MACH_O_TYPE'] != 'staticlib' }
    raise 'QuralingoRecitation requires use_frameworks! :linkage => :dynamic in the host Podfile'
  end
  url = 'https://github.com/Quran-Lab/tajweedformer-apple'
  ref = project.root_object.package_references.find { |r| r.respond_to?(:repositoryURL) && r.repositoryURL == url }
  unless ref
    ref = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
    ref.repositoryURL = url
    project.root_object.package_references << ref
  end
  ref.requirement = { 'kind' => 'exactVersion', 'version' => '3.1.4' }
  product = target.package_product_dependencies.find { |p| p.product_name == 'TajweedFormer' }
  unless product
    product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
    product.product_name = 'TajweedFormer'
    target.package_product_dependencies << product
  end
  # RN's post_install can clean package references; repair the existing product too.
  product.package = ref
  unless target.frameworks_build_phase.files.any? { |f| f.product_ref == product }
    build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
    build_file.product_ref = product
    target.frameworks_build_phase.files << build_file
  end
  target.build_configurations.each do |config|
    paths = config.build_settings['SWIFT_INCLUDE_PATHS']
    paths = paths.nil? ? ['$(inherited)'] : Array(paths)
    paths |= ['${SYMROOT}/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}/']
    config.build_settings['SWIFT_INCLUDE_PATHS'] = paths
  end
  product.package = ref # RN post_install may have removed the old package reference.
  target.build_configurations.each do |config|
    settings = config.build_settings
    paths = Array(settings['SWIFT_INCLUDE_PATHS'] || ['$(inherited)'])
    path = '${SYMROOT}/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}/'
    paths << path unless paths.include?(path)
    settings['SWIFT_INCLUDE_PATHS'] = paths
  end
end
