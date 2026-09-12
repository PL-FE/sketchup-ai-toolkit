# frozen_string_literal: true
# Compatibility regression for the SketchUp 2020 / Ruby 2.5 adapter.
# Run with: ruby test/ruby25_compat_test.rb
# This executes production methods with narrow SketchUp doubles. It does not
# replace testing inside SketchUp 2020 or claim full Ruby 2.5 runtime coverage.

require 'digest'
require 'json'
require_relative '../sketchup_plugin/alma_sketchup_mcp/capture_detail_views'
require_relative '../sketchup_plugin/alma_sketchup_mcp/geometry_evidence'
require_relative '../sketchup_plugin/alma_sketchup_mcp/native_asset_operations'
require_relative '../sketchup_plugin/alma_sketchup_mcp/view_operations'
require_relative '../sketchup_plugin/alma_sketchup_mcp/materials'

# Ruby 2.5 ignores to_h blocks; newer Ruby accepts them. Reject blocks in this
# process so running this regression on newer Ruby cannot conceal the defect.
module RejectModernToHBlock
  def to_h(*arguments, &block)
    raise 'Ruby 2.5 does not support to_h with a block' if block

    super(*arguments)
  end
end
Array.prepend(RejectModernToHBlock)
Hash.prepend(RejectModernToHBlock)
Enumerable.prepend(RejectModernToHBlock)

module AlmaSketchupMCP
  MODEL_REVISION_UNIQUE_ENTITY_LIMIT = 100
end

class CompatibilityEntities < Array
  def active_section_plane
    nil
  end
end

class CompatibilityModel
  attr_accessor :entities, :definitions, :snapshot_data, :rendering_options,
                :shadow_info, :styles, :pages, :options, :layers

  def initialize
    @entities = CompatibilityEntities.new
    @definitions = []
    @snapshot_data = { 'materials' => [{ 'name' => 'Existing' }], 'tags' => [] }
    @rendering_options = { 'RenderMode' => 0, 'BackgroundColor' => 'white' }
    @shadow_info = { 'DisplayShadows' => false, 'Light' => 80 }
    @styles = Struct.new(:active_style_changed, :selected_style).new(false, :style)
    @pages = Struct.new(:selected_page).new(:page)
    @options = { 'PageOptions' => { 'ShowTransition' => true } }
    @layers = []
  end
end

class CompatibilityHarness
  include AlmaSketchupMCP
  attr_reader :stored_state

  def snapshot(model, include_detail_evidence: true)
    Marshal.load(Marshal.dump(model.snapshot_data))
  end

  def revision_entities_report(_entities, _state, _ancestors)
    { 'digest' => 'stubbed-native-geometry' }
  end

  def selectable_entity?(_entity)
    true
  end

  def revision_entity_sort_key(entity)
    entity.object_id
  end

  def revision_entity_payload(entity, _child)
    { 'local_transformation' => entity.matrix }
  end

  def revision_child_definition_report(_entity, _state, _ancestors)
    nil
  end

  def entity_attributes(_entity)
    {}
  end

  def revision_json(source)
    JSON.generate(source)
  end

  def set_document_state_value(field, value, _model)
    @stored_state = [field, value]
  end
end

def check(condition, message)
  raise message unless condition
end

harness = CompatibilityHarness.new
model = CompatibilityModel.new

# Style conversion must apply and report the native enum on Ruby 2.5.
style = harness.set_style(model, 'face_style' => 'shaded_with_textures')
check(model.rendering_options['RenderMode'] == 3, 'Style native value was not set')
check(style['face_style'] == 'shaded_with_textures', 'Style state was not preserved')

# A triangulated rectangular cap must yield its outside loop, cancelling the
# shared diagonal. This is part of default detailed geometry evidence.
corners = [[0, 0, 0], [10, 0, 0], [10, 5, 0], [0, 5, 0]]
profiles = harness.native_coplanar_outer_profiles([
  [[corners[0], corners[1], corners[2]]],
  [[corners[0], corners[2], corners[3]]]
])
check(profiles.length == 1 && profiles.first.sort == corners.sort,
      'Triangulated cap perimeter was not reconstructed')

# Capture must preserve all original native rendering and shadow settings.
restore = harness.detail_scene_restore_plan(model)
check(restore[:rendering] == model.rendering_options, 'Rendering restore state is incomplete')
check(restore[:shadow] == model.shadow_info, 'Shadow restore state is incomplete')
check(restore[:rendering].object_id != model.rendering_options.object_id,
      'Rendering restore state aliases mutable native options')

# The facing guard must exempt only registered transforms, while continuing
# to detect changes to other objects and model resources.
entity_class = Struct.new(:matrix)
registered = entity_class.new('first-transform')
protected_entity = entity_class.new('fixed-transform')
model.entities.concat([registered, protected_entity])
records = [{ entity: registered }]
signature = harness.detail_capture_facing_preservation_signature(model, records)
registered.matrix = 'rotated-for-camera'
check(signature == harness.detail_capture_facing_preservation_signature(model, records),
      'Registered camera-facing transform should not alter the preservation guard')
protected_entity.matrix = 'unexpected-change'
check(signature != harness.detail_capture_facing_preservation_signature(model, records),
      'Unregistered object change escaped the preservation guard')
protected_entity.matrix = 'fixed-transform'
model.snapshot_data['tags'] = ['Changed']
check(signature != harness.detail_capture_facing_preservation_signature(model, records),
      'Resource change escaped the preservation guard')

# Asset preservation must retain the protected baseline resources, permitting
# newly imported ones without dropping existing resources from the check.
model.entities.clear
baseline = harness.native_asset_preservation_record(model, [], nil)
model.snapshot_data['materials'] << { 'name' => 'Imported' }
after_import = harness.native_asset_preservation_record(model, [], nil, baseline)
check(after_import == baseline, 'New imported resource should not change the protected baseline')
model.snapshot_data['materials'].delete_if { |material| material['name'] == 'Existing' }
check(harness.native_asset_preservation_record(model, [], nil, baseline) != baseline,
      'Removal of existing resource escaped the preservation guard')

puts "Ruby #{RUBY_VERSION}: compatibility regression passed (7 former to_h block sites exercised)."
