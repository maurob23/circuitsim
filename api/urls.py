from django.urls import path
from .views import SimulateView, HealthView

urlpatterns = [
    path("simulate/", SimulateView.as_view(), name="simulate"),
    path("health/", HealthView.as_view(), name="health"),
]
