from django.urls import path


def list_tokens(request):
    return []


def create_token(request):
    return {"id": 1}


def delete_token(request, token_id):
    return {"deleted": token_id}


urlpatterns = [
    path('', list_tokens),
    path('create/', create_token),
    path('<int:token_id>/delete/', delete_token),
]
