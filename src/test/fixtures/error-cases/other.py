from django.urls import path

from .main import urlpatterns as main_urls  # circular import back to main


def other(request):
    return {"other": True}


urlpatterns = [
    path('', other),
]
