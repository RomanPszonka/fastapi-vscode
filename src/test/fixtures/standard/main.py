from django.urls import path, include

from app.main import urlpatterns as app_urls


def health_check(request):
    return {"status": "ok"}


urlpatterns = [
    path('health/', health_check),
    path('v1/', include(app_urls)),
]
