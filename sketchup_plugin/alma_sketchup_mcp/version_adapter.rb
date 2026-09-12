# frozen_string_literal: true
# Added 2026-09-12: SketchUp year profiles; compatible with embedded Ruby 2.5.
require 'json'

module AlmaSketchupMCP
  module VersionAdapter
    extend self
    TRANSPORT = 'sketchup-year-queue.v1'.freeze

    class CompatibilityError < StandardError
      def response_payload
        { 'code' => 'SKETCHUP_VERSION_UNSUPPORTED', 'message' => message,
          'retryable' => false, 'next_action' => { 'action' => 'check_sketchup_year_and_capabilities' } }
      end
    end

    def registry
      @registry ||= JSON.parse(File.read(File.join(__dir__, 'sketchup-versions.json')))
    end

    def profile(version = Sketchup.version, ruby_version = RUBY_VERSION)
      major = version.to_s.split('.').first.to_i
      year = 2000 + major
      entry = registry.fetch('profiles', {})[year.to_s]
      unless registry['schema_version'] == 1 && entry && entry['sketchup_major'] == major &&
             entry['minimum_ruby'].to_s.match?(/\A\d+\.\d+\.\d+\z/) &&
             [true, false].include?(entry['native_pbr']) && [true, false].include?(entry['native_environments'])
        raise CompatibilityError, "SketchUp #{year} has no valid registered adapter."
      end
      minimum = entry['minimum_ruby'].split('.').map(&:to_i)
      actual = ruby_version.split('.').map(&:to_i)
      if (actual <=> minimum) == -1
        raise CompatibilityError, "SketchUp #{year} requires Ruby #{entry['minimum_ruby']} or newer."
      end
      entry.merge('year' => year)
    end

    def state_dir
      File.expand_path(File.join('~', '.sketchup-mcp', 'versions', profile['year'].to_s))
    end

    def transport_identity
      { 'protocol' => TRANSPORT, 'year' => profile['year'] }
    end

    def assert_request!(request)
      unless request['target_year'] == profile['year'] && request['transport_version'] == TRANSPORT
        raise CompatibilityError, "Request targets SketchUp #{request['target_year'].inspect}; this bridge is SketchUp #{profile['year']}."
      end
    end

    MATERIAL_FIELDS = %w[material back_material backMaterial front_material frontMaterial f_material b_material hole_material holeMaterial frame_material frameMaterial panel_material panelMaterial].freeze

    # Inspect actual operation/material schemas, not arbitrary attribute/QA
    # payloads (which may legitimately contain words such as "environment").
    def validate_document!(value, selected = profile)
      if value.is_a?(Array)
        value.each { |item| validate_document!(item, selected) }
      elsif value.is_a?(Hash)
        op = value['op'].to_s
        wants_environment = op.start_with?('environment_') || (op == 'scene' && (value.key?('environment_ref') || value.key?('use_environment')))
        if wants_environment && !selected['native_environments']
          raise CompatibilityError, "Native HDR environments are unavailable in SketchUp #{selected['year']}."
        end
        validate_material!(value, selected) if op == 'material'
        unless op.empty?
          MATERIAL_FIELDS.each { |field| validate_material!(value[field], selected) if value[field].is_a?(Hash) }
        end
        validate_document!(value['operations'], selected) if value['operations'].is_a?(Array)
      end
      true
    end

    def validate_material!(value, selected)
      wants_pbr = value['workflow'].to_s.downcase.tr(' -', '_') == 'pbr_metallic_roughness' || (value['pbr'].is_a?(Hash) && !value['pbr'].empty?)
      if wants_pbr && !selected['native_pbr']
        raise CompatibilityError, "Native PBR materials are unavailable in SketchUp #{selected['year']}; use classic color/texture materials."
      end
    end

    def operation_support(base)
      selected = profile
      base.each_with_object({}) do |(name, descriptor), result|
        result[name] = descriptor.dup
        if name.start_with?('environment_') && !selected['native_environments']
          result[name]['status'] = 'unsupported'
          result[name]['reason'] = "Unavailable in SketchUp #{selected['year']}"
        end
      end
    end
  end
end
