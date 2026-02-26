from django.urls import path


def list_users(request):
    return [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]


def get_user(request, user_id):
    return {"id": user_id, "name": "Alice"}


def create_user(request):
    return {"id": 3, "name": "Charlie"}


urlpatterns = [
    path('', list_users),
    path('<int:user_id>/', get_user),
    path('create/', create_user),
]
