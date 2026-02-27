# Note: namespace_routes has NO __init__.py (namespace package)
from django.urls import path


def list_users(request):
    return [{"id": 1, "name": "Alice"}]


def get_user(request, user_id):
    return {"id": user_id, "name": "Alice"}


urlpatterns = [
    path('', list_users),
    path('<int:user_id>/', get_user),
]
