# frozen_string_literal: true
# Load the production plugin with a minimal loader/UI double. Geometry is not
# simulated: these tests exercise transport, rejection timing and guard entry.
require 'tmpdir'
require 'json'
module Sketchup
  class AppObserver; end
  def self.version; '20.0.373'; end
end
# The host library is represented only for loading. Skip menu registration.
$LOADED_FEATURES << 'sketchup.rb'
def file_loaded?(_file); true; end
require_relative '../sketchup_plugin/alma_sketchup_mcp/version_adapter'
Dir.mktmpdir('sketchup-plugin-transport-') do |temporary|
  AlmaSketchupMCP::VersionAdapter.define_singleton_method(:state_dir) { temporary }
  require_relative '../sketchup_plugin/alma_sketchup_mcp'
  bridge = AlmaSketchupMCP
  FileUtils.mkdir_p([bridge::QUEUE_DIR, bridge::PROCESSING_DIR, bridge::RESPONSE_DIR])
  calls = []
  original_dispatch = bridge.method(:dispatch)
  bridge.define_singleton_method(:dispatch) { |method, _params| calls << method; { 'kind' => 'transport-test' } }
  [[2026, false], [2020, true]].each_with_index do |(year, should_dispatch), index|
    id = "test-#{index}"
    File.write(File.join(bridge::QUEUE_DIR, "#{id}.json"), JSON.generate('id' => id, 'method' => 'build_model', 'target_year' => year, 'transport_version' => bridge::VersionAdapter::TRANSPORT))
    bridge.process_pending_requests
    response_path = File.join(bridge::RESPONSE_DIR, "#{id}.json")
    response = JSON.parse(File.read(response_path))
    raise 'Incorrect response year' unless response['bridge']['year'] == 2020
    raise 'Wrong-year operation dispatched' unless calls.length == (should_dispatch ? 1 : 0)
    raise 'Wrong-year error missing' unless should_dispatch || response['error']['code'] == 'SKETCHUP_VERSION_UNSUPPORTED'
    File.delete(response_path)
  end
  raise 'Claim was not released' unless Dir[File.join(bridge::PROCESSING_DIR, '*.json')].empty?
  bridge.define_singleton_method(:dispatch, original_dispatch)
  bridge.define_singleton_method(:reconcile_queue_active_model) { nil }
  begin
    bridge.dispatch('build_model', 'code' => '{}')
    raise 'Missing session guard accepted'
  rescue AlmaSketchupMCP::QueueGuardError => error
    raise 'Wrong session error' unless error.code == 'HANDSHAKE_REQUIRED'
  end
  model_access = 0
  bridge.define_singleton_method(:active_model_or_new) { |_method| model_access += 1; raise 'Unexpected model access' }
  begin
    bridge.build_model(JSON.generate('version' => 1, 'units' => 'mm', 'operations' => [{ 'op' => 'material', 'name' => 'pbr', 'pbr' => { 'roughness_factor' => 0.5 } }]))
    raise 'PBR was accepted'
  rescue AlmaSketchupMCP::VersionAdapter::CompatibilityError
    raise 'Unsupported API reached model before rejection' unless model_access.zero?
  end
end
puts "Ruby #{RUBY_VERSION}: production plugin transport and pre-mutation guards passed (host doubles, no native geometry test)."
