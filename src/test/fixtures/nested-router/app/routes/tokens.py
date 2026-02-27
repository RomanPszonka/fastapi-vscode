from django.urls import path


def list_tokens(request, app_id):
    return []


def create_token(request, app_id):
    return {"id": 1}


urlpatterns = [
    path('', list_tokens),
    path('create/', create_token),
]
