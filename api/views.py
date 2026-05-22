import json
import time
import uuid

from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from solver.router import route_simulation


@method_decorator(csrf_exempt, name="dispatch")
class SimulateView(View):
    def post(self, request):
        try:
            netlist = json.loads(request.body)
        except (json.JSONDecodeError, ValueError) as exc:
            return JsonResponse({"error": f"Invalid JSON: {exc}"}, status=400)

        if "components" not in netlist or "analysis" not in netlist:
            return JsonResponse(
                {"error": "Netlist must contain 'components' and 'analysis' keys"},
                status=400,
            )

        try:
            t_start = time.perf_counter()
            result = route_simulation(netlist)
            elapsed_ms = int((time.perf_counter() - t_start) * 1000)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=422)
        except Exception as exc:
            return JsonResponse({"error": f"Solver error: {exc}"}, status=500)

        return JsonResponse(
            {
                "simulation_id": str(uuid.uuid4()),
                "tier_used": result["tier"],
                "analysis_type": netlist["analysis"]["type"],
                "results": {
                    "frequencies":  result.get("frequencies", []),
                    "magnitude_db": result.get("magnitude_db", []),
                    "phase_deg":    result.get("phase_deg", []),
                    "times":        result.get("times", []),
                    "voltages":     result.get("voltages", []),
                    "vin":          result.get("vin", []),
                    "vout":         result.get("vout", []),
                    "node_traces":  result.get("node_traces", {}),
                },
                "metrics": result.get("metrics", {}),
                "solver_info": {
                    "solver": result["solver"],
                    "elapsed_ms": elapsed_ms,
                    "convergence": result.get("convergence", True),
                },
            }
        )


class HealthView(View):
    def get(self, request):
        return JsonResponse({"status": "ok", "version": "0.1.0"})
