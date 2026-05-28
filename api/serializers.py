"""Input serializers for the CircuitSim API boundary."""

from __future__ import annotations

from rest_framework import serializers


class ComponentSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.ChoiceField(choices=("resistor", "capacitor", "voltage_source"))
    value = serializers.FloatField()
    unit = serializers.ChoiceField(choices=("ohm", "farad", "volt"), required=False)
    nodes = serializers.ListField(
        child=serializers.CharField(),
        min_length=2,
        max_length=2,
    )


class AnalysisSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=("ac", "transient", "dc"))
    start_freq = serializers.FloatField(required=False)
    stop_freq = serializers.FloatField(required=False)
    points_per_decade = serializers.IntegerField(required=False, min_value=1)
    stop_time = serializers.CharField(required=False)

    def validate(self, attrs):
        analysis_type = attrs["type"]
        if analysis_type == "ac":
            missing = [
                field
                for field in ("start_freq", "stop_freq", "points_per_decade")
                if field not in attrs
            ]
            if missing:
                raise serializers.ValidationError(
                    f"AC analysis requires: {', '.join(missing)}"
                )
            if attrs["stop_freq"] <= attrs["start_freq"]:
                raise serializers.ValidationError("AC analysis requires stop_freq > start_freq")
        elif analysis_type == "transient" and "stop_time" not in attrs:
            raise serializers.ValidationError("Transient analysis requires stop_time")
        return attrs


class NetlistSerializer(serializers.Serializer):
    components = ComponentSerializer(many=True, allow_empty=False)
    analysis = AnalysisSerializer()
    output_nodes = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False,
    )


def validate_netlist_payload(data: dict) -> dict:
    """Return validated data or raise ValueError with a readable message."""
    serializer = NetlistSerializer(data=data)
    if serializer.is_valid():
        return serializer.validated_data
    raise ValueError(serializer.errors)
