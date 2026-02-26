from django.urls import path


def get_neon(request):
    return {"provider": "neon"}


def connect_neon(request):
    return {"connected": True}


urlpatterns = [
    path('', get_neon),
    path('connect/', connect_neon),
]
