# frozen_string_literal: true
# Production adapter checks; SketchUp API itself is not emulated here.
require 'json'
require 'tmpdir'
require_relative '../sketchup_plugin/alma_sketchup_mcp/version_adapter'
module Sketchup
  def self.version; '20.0.373'; end
end
adapter = AlmaSketchupMCP::VersionAdapter
def check(value, message); raise message unless value; end
def rejects
  yield
  raise 'Expected version compatibility rejection'
rescue AlmaSketchupMCP::VersionAdapter::CompatibilityError
  true
end
check(adapter.profile('20.0.373', '2.5.5')['year'] == 2020, '2020 profile failed')
check(adapter.profile('26.0.0', '3.2.2')['native_pbr'], '2026 profile failed')
rejects { adapter.profile('24.0.0', '3.2.2') }
rejects { adapter.profile('20.0.0', '2.4.0') }
check(adapter.state_dir.end_with?(File.join('versions', '2020')), 'State is not year isolated')
adapter.assert_request!('target_year' => 2020, 'transport_version' => adapter::TRANSPORT)
rejects { adapter.assert_request!('target_year' => 2026, 'transport_version' => adapter::TRANSPORT) }
rejects { adapter.assert_request!('target_year' => '2020', 'transport_version' => adapter::TRANSPORT) }
rejects { adapter.assert_request!({}) }
rejects { adapter.validate_document!('operations' => [{ 'op' => 'environment_activate', 'environment_ref' => nil }]) }
rejects { adapter.validate_document!('operations' => [{ 'op' => 'component_definition', 'operations' => [{ 'op' => 'material', 'name' => 'x', 'pbr' => { 'roughness_factor' => 0.5 } }] }]) }
rejects { adapter.validate_document!('operations' => [{ 'op' => 'box', 'material' => { 'name' => 'x', 'pbr' => { 'roughness_factor' => 0.5 } } }]) }
adapter.validate_document!('operations' => [{ 'op' => 'attribute', 'key' => 'parameters', 'value' => { 'environment' => 'outdoor', 'pbr' => { 'reference' => 'image' } } }])
adapter.validate_document!('operations' => [{ 'op' => 'material', 'name' => 'x', 'color' => '#112233', 'workflow' => 'classic' }, { 'op' => 'box', 'size' => [1, 2, 3] }])
adapter.validate_document!({ 'operations' => [{ 'op' => 'material', 'pbr' => { 'roughness_factor' => 0.5 } }] }, adapter.profile('26.0', '3.2.2'))
support = { 'environment_activate' => { 'status' => 'partial' }, 'box' => { 'status' => 'supported' } }
check(adapter.operation_support(support)['environment_activate']['status'] == 'unsupported', 'Capability filtering failed')
check(support['environment_activate']['status'] == 'partial', 'Filtering modified the registry')
puts "Ruby #{RUBY_VERSION}: year routing and old-host capability checks passed."
