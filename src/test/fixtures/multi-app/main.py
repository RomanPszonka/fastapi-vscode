from django.urls import path

# Multiple URL configurations in the same file


def public_root(request):
    return {"message": "Public API"}


def list_products(request):
    return {"products": []}


def admin_root(request):
    return {"message": "Admin API"}


def list_users(request):
    return {"users": []}


def delete_user(request, user_id):
    return {"deleted": user_id}


public_urlpatterns = [
    path('', public_root),
    path('products/', list_products),
]

admin_urlpatterns = [
    path('', admin_root),
    path('users/', list_users),
    path('users/<int:user_id>/delete/', delete_user),
]
