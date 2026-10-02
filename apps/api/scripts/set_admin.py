"""Выдать существующему аккаунту роль администратора из серверной консоли."""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.user import User, UserRole


async def set_admin(email: str) -> int:
    factory = get_session_factory()
    async with factory() as db:
        user = await db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            print("Пользователь с такой почтой не найден")
            return 1
        if user.role is UserRole.admin:
            print(f"Роль администратора уже выдана: {user.username}")
            return 0
        user.role = UserRole.admin
        await db.commit()
        print(f"Роль администратора выдана: {user.username}")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", help="Почта существующего аккаунта")
    args = parser.parse_args()
    return asyncio.run(set_admin(args.email))


if __name__ == "__main__":
    raise SystemExit(main())
