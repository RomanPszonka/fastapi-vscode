from django.urls import path, include

from .tokens import urlpatterns as tokens_urls
from .settings import urlpatterns as settings_urls


def list_apps(request):
    return []


def get_app(request, app_id):
    return {"id": app_id}


# Nested URL includes - apps includes tokens and settings
urlpatterns = [
    path('', list_apps),
    path('<int:app_id>/', get_app),
    path('<int:app_id>/tokens/', include(tokens_urls)),
    path('<int:app_id>/settings/', include(settings_urls)),
]
