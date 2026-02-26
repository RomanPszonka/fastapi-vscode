from django.urls import path


def get_settings(request, app_id):
    return {}


def update_settings(request, app_id):
    return {}


urlpatterns = [
    path('', get_settings),
    path('', update_settings),
]
