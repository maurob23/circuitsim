from django.urls import path
from .views import SimulateView, HealthView, ManualOpenView, TranslateView

urlpatterns = [
    path("simulate/", SimulateView.as_view(), name="simulate"),
    path("translate/", TranslateView.as_view(), name="translate"),
    path("health/", HealthView.as_view(), name="health"),
    path("manual/open/", ManualOpenView.as_view(), name="manual-open"),
]
