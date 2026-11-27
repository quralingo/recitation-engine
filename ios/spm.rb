# Call AFTER react_native_post_install. Xcode archives SPM implementations into
# static pods even without a Frameworks phase entry. The POD must own SDK linkage;
# consumers link that pod. Xcode owns SPM resources; do not add a second producer.
module QuralingoRecitationSPM
  URL = 'https://github.com/Quran-Lab/tajweedformer-apple'.freeze
  PRODUCT = 'TajweedFormer'.freeze
  POD = 'QuralingoRecitation'.freeze
  REQUIREMENT = { 'kind' => 'exactVersion', 'version' => '4.0.3' }.freeze
  RESOURCE_BUNDLE = 'TajweedFormer_TajweedFormer.bundle'.freeze
  RESOURCE_PHASE = '[QuralingoRecitation] Copy SDK Resources'.freeze
  CORE_FRAMEWORK = 'QuranLabCore.framework'.freeze
  EMBED_PHASE = '[QuralingoRecitation] Embed Core'.freeze

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

  def self.remove_host_link(project, target)
    target.frameworks_build_phase.files.select { |f| our_product?(f.product_ref) }.each(&:remove_from_project)
    target.package_product_dependencies.select { |p| our_product?(p) }.each do |product|
      target.package_product_dependencies.delete(product)
    end
    # Remove only now-unused references to this SDK, keeping other products/targets intact.
    project.root_object.package_references.to_a.each do |ref|
      next unless ref.respond_to?(:repositoryURL) && ref.repositoryURL == URL
      used = project.targets.any? do |t|
        products = t.respond_to?(:package_product_dependencies) ? Array(t.package_product_dependencies) : []
        phase = t.respond_to?(:frameworks_build_phase) ? t.frameworks_build_phase : nil
        products.any? { |p| p.package == ref } ||
          (phase && phase.files.any? { |f| f.product_ref && f.product_ref.package == ref })
      end
      project.root_object.package_references.delete(ref) unless used
    end
  end

  # Xcode propagates the SPM bundle through the retained pod product dependency.
  # beta.4's second producer conflicts before compilation, even on fresh builds.
  def self.remove_resource_copy_phases(target)
    target.shell_script_build_phases.select { |p| p.name == RESOURCE_PHASE }.each(&:remove_from_project)
  end

  def self.embed_core(project, target)
    # SwiftPM selects the XCFramework slice in BUILT_PRODUCTS_DIR. Static pod
    # linkage does not propagate its dynamic dependency into the app bundle.
    phase = target.copy_files_build_phases.find { |p| p.name == EMBED_PHASE } ||
      target.new_copy_files_build_phase(EMBED_PHASE)
    phase.dst_subfolder_spec = '10' # Frameworks; Xcode handles signing on copy.
    phase.dst_path = ''
    file = phase.files.find { |f| f.file_ref&.path == CORE_FRAMEWORK }
    unless file
      ref = project.files.find { |f| f.path == CORE_FRAMEWORK && f.source_tree == 'BUILT_PRODUCTS_DIR' } ||
        project.frameworks_group.new_file(CORE_FRAMEWORK, :built_products)
      file = phase.add_file_reference(ref, true)
    end
    file.settings = { 'ATTRIBUTES' => ['CodeSignOnCopy', 'RemoveHeadersOnCopy'] }
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
    # Preserve beta.3's successful pod compilation/archive graph. A static SPM
    # product dependency itself makes Xcode archive SDK objects; no phase entry
    # is needed. The defect was the ADDITIONAL product on the app target.
    QuralingoRecitationSPM.attach(project, target, link: !static)
    next unless static
    hosts.each do |host_project, host_target|
      QuralingoRecitationSPM.remove_host_link(host_project, host_target)
      QuralingoRecitationSPM.remove_resource_copy_phases(host_target)
    end
  end
  hosts.each { |host_project, host_target| QuralingoRecitationSPM.embed_core(host_project, host_target) }
  # CocoaPods saves Pods.xcodeproj after post_install; user project edits need saving too.
  hosts.map(&:first).uniq.each { |host_project| host_project.save unless host_project == project }
end
