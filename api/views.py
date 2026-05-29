import json
import time
import uuid

from django.conf import settings
from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from api.validation import validate_netlist
from services.pdf_viewer import candidate_sumatra_paths, open_manual
from services.translation import TranslationError, translate_text
from solver.router import route_simulation


MANUAL_PDF_PATH = settings.BASE_DIR / "books" / "practical-electronics-for-inventors.pdf"


MANUAL_TOPICS = {
    "passivi": 71,
    "attivi": 423,
    "alimentatori": 847,
    "trasformatori": 879,
    "mcu": 1019,
    "digitale": 941,
    "strumenti": 1125,
}


@method_decorator(csrf_exempt, name="dispatch")
class SimulateView(View):
    def post(self, request):
        try:
            netlist = json.loads(request.body)
        except (json.JSONDecodeError, ValueError) as exc:
            return JsonResponse({"error": f"Invalid JSON: {exc}"}, status=400)

        try:
            validate_netlist(netlist)
            t_start = time.perf_counter()
            result = route_simulation(netlist)
            elapsed_ms = int((time.perf_counter() - t_start) * 1000)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=422)
        except Exception as exc:
            return JsonResponse({"error": f"Solver error: {exc}"}, status=500)

        if "error" in result:
            return JsonResponse({"error": result["error"]}, status=422)

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
                    "node_voltages": result.get("node_voltages", {}),
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


@method_decorator(csrf_exempt, name="dispatch")
class TranslateView(View):
    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except (json.JSONDecodeError, ValueError) as exc:
            return JsonResponse({"error": f"Invalid JSON: {exc}"}, status=400)

        try:
            result = translate_text(
                text=payload.get("text", ""),
                direction=payload.get("direction", "en_it"),
            )
        except TranslationError as exc:
            return JsonResponse({"error": str(exc)}, status=422)

        return JsonResponse(result)


@method_decorator(csrf_exempt, name="dispatch")
class ManualOpenView(View):
    def post(self, request):
        try:
            payload = json.loads(request.body or "{}")
        except (json.JSONDecodeError, ValueError) as exc:
            return JsonResponse({"error": f"Invalid JSON: {exc}"}, status=400)

        book_id = payload.get("book", "inventors")
        books = {
            "inventors": "practical-electronics-for-inventors.pdf",
            "art": "the-art-of-electronics.pdf",
            "guitarists": "electronics-for-guitarists.pdf"
        }
        
        book_filename = books.get(book_id)
        if not book_filename:
            return JsonResponse({"error": "Libro non valido"}, status=400)

        topic = payload.get("topic")
        page = None
        
        if book_id == "inventors":
            page = MANUAL_TOPICS.get(topic)
            if page is None:
                return JsonResponse({"error": "Manuale non configurato per questa sezione"}, status=404)

        pdf_path = settings.BASE_DIR / "books" / book_filename

        if not pdf_path.exists():
            return JsonResponse(
                {
                    "error": "PDF non trovato",
                    "path": str(pdf_path),
                },
                status=404,
            )

        try:
            opened = open_manual(str(pdf_path), page=page)
        except OSError as exc:
            return JsonResponse({"error": f"Impossibile aprire SumatraPDF: {exc}"}, status=500)

        if not opened:
            return JsonResponse(
                {
                    "error": "SumatraPDF non trovato",
                    "paths_checked": [str(path) for path in candidate_sumatra_paths()],
                },
                status=500,
            )

        return JsonResponse({"status": "ok", "topic": topic, "book": book_id, "page": page})
