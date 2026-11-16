# Call AFTER react_native_post_install. Static pods compile against the SDK; the
# consuming app links it once. Do not archive the SDK into a static pod as well.
module QuralingoRecitationSPM
  URL = 'https://github.com/Quran-Lab/tajweedformer-apple'.freeze
  PRODUCT = 'TajweedFormer'.freeze
  POD = 'QuralingoRecitation'.freeze
  REQUIREMENT = { 'kind' => 'exactVersion', 'version' => '3.1.4' }.freeze

  def self.recitation_pod?(target)
    (target.respond_to?(:pod_name) && target.pod_name == POD) ||
      (target.respond_to?(:name) && target.name == POD)
  end

  def self.static?(installer, target)
    if installer.respond_to?(:pod_targets)
      pod = installer.pod_targets.find { |p| p.respond_to?(:label) && p.label == target.name }
      return pod.build_as_static? if pod && pod.respond_to?(:build_as_static?)
    end
    target.product_type == 'com.apple.product-type.library.static' ||
      target.build_configurations.any? { |c| c.build_settings['MACH_O_TYPE'] == 'staticlib' }
  end

  def self.consumers(installer)
    return [] unless installer.respond_to?(:aggregate_targets)
    installer.aggregate_targets.select { |a| a.pod_targets.any? { |p| recitation_pod?(p) } }
      .flat_map { |a| a.user_targets.map { |t| [a.user_project, t] } }
      .uniq { |project, target| [project.path.to_s, target.uuid] }
  end

  def self.our_product?(product)
    product && product.product_name == PRODUCT &&
      product.package && product.package.respond_to?(:repositoryURL) && product.package.repositoryURL == URL
  end

  def self.attach(project, target, link:)
    ref = project.root_object.package_references.find { |r| r.respond_to?(:repositoryURL) && r.repositoryURL == URL }
    unless ref
      ref = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
      ref.repositoryURL = URL
      project.root_object.package_references << ref
    end
    ref.requirement = REQUIREMENT.dup
    products = target.package_product_dependencies.select { |p| our_product?(p) }
    product = products.shift
    products.each do |duplicate|
      target.frameworks_build_phase.files.select { |f| f.product_ref == duplicate }.each(&:remove_from_project)
      target.package_product_dependencies.delete(duplicate)
    end
    unless product
      product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
      product.product_name = PRODUCT
      target.package_product_dependencies << product
    end
    # Repair refs left behind when RN cleans root package references.
    product.package = ref
    files = target.frameworks_build_phase.files.select { |f| our_product?(f.product_ref) }
    if link
      files.drop(1).each(&:remove_from_project)
      if files.empty?
        file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
        file.product_ref = product
        target.frameworks_build_phase.files << file
      else
        files.first.product_ref = product
      end
    else
      files.each(&:remove_from_project)
    end
    target.build_configurations.each do |config|
      paths = Array(config.build_settings['SWIFT_INCLUDE_PATHS'] || ['$(inherited)'])
      config.build_settings['SWIFT_INCLUDE_PATHS'] = paths | ['${SYMROOT}/${CONFIGURATION}${EFFECTIVE_PLATFORM_NAME}/']
    end
  end
end

def quralingo_recitation_spm(installer)
  project = installer.pods_project
  targets = project.targets.select { |t| t.name == QuralingoRecitationSPM::POD }
  raise 'QuralingoRecitation pod target not found' if targets.empty?
  hosts = QuralingoRecitationSPM.consumers(installer)
  if targets.any? { |t| QuralingoRecitationSPM.static?(installer, t) } && hosts.empty?
    raise 'QuralingoRecitation static linkage needs a consuming user target. Call this helper from CocoaPods post_install after react_native_post_install.'
  end
  targets.each do |target|
    static = QuralingoRecitationSPM.static?(installer, target)
    QuralingoRecitationSPM.attach(project, target, link: !static)
    next unless static
    hosts.each { |host_project, host_target| QuralingoRecitationSPM.attach(host_project, host_target, link: true) }
  end
  # CocoaPods saves Pods.xcodeproj after post_install; user project edits need saving too.
  hosts.map(&:first).uniq.each { |host_project| host_project.save unless host_project == project }
end
