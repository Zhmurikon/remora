"""HTTP API первого среза учебных классов."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.classes import (
    AssignmentCreate,
    AssignmentOut,
    ClassCardReportOut,
    ClassReportOut,
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomInviteOut,
    ClassroomJoin,
    ClassroomJoinOut,
    ClassroomMemberAdd,
    ClassroomMemberOut,
    ClassroomOut,
    ClassroomUpdate,
    ClassSetAdd,
    ClassSetOut,
    StudentReportOut,
)
from app.services.class_report_xlsx import build_class_report_xlsx
from app.services.classes import ClassroomService

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[ClassroomOut], summary="Мои классы")
async def list_classes(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[ClassroomOut]:
    return await ClassroomService(db).list_mine(user)


@router.post(
    "", response_model=ClassroomOut, status_code=status.HTTP_201_CREATED, summary="Создать класс"
)
async def create_class(
    body: ClassroomCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomOut:
    return await ClassroomService(db).create(user, body)


@router.post("/join", response_model=ClassroomJoinOut, summary="Вступить в класс по коду")
async def join_class(
    body: ClassroomJoin,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomJoinOut:
    return await ClassroomService(db).join(user, body)


@router.get("/{class_id}", response_model=ClassroomDetailOut, summary="Открыть класс")
async def get_class(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomDetailOut:
    return await ClassroomService(db).get(user, class_id)


@router.patch("/{class_id}", response_model=ClassroomOut, summary="Изменить класс")
async def update_class(
    class_id: UUID,
    body: ClassroomUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomOut:
    return await ClassroomService(db).update(user, class_id, body)


@router.get("/{class_id}/invite", response_model=ClassroomInviteOut, summary="Код и ссылка класса")
async def get_class_invite(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomInviteOut:
    return await ClassroomService(db).invite(user, class_id)


@router.post(
    "/{class_id}/invite/rotate",
    response_model=ClassroomInviteOut,
    summary="Сменить код вступления",
)
async def rotate_class_invite(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomInviteOut:
    return await ClassroomService(db).rotate_join_code(user, class_id)


@router.post(
    "/{class_id}/members",
    response_model=ClassroomMemberOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить участника",
)
async def add_class_member(
    class_id: UUID,
    body: ClassroomMemberAdd,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomMemberOut:
    return await ClassroomService(db).add_member(user, class_id, body)


@router.post(
    "/{class_id}/members/{member_id}/approve",
    response_model=ClassroomMemberOut,
    summary="Одобрить вступление в класс",
)
async def approve_class_member(
    class_id: UUID,
    member_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomMemberOut:
    return await ClassroomService(db).approve_member(user, class_id, member_id)


@router.get("/{class_id}/sets", response_model=list[ClassSetOut], summary="Наборы класса")
async def list_class_sets(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClassSetOut]:
    return await ClassroomService(db).list_class_sets(user, class_id)


@router.post(
    "/{class_id}/sets",
    response_model=ClassSetOut,
    status_code=status.HTTP_201_CREATED,
    summary="Расшарить набор в классе",
)
async def share_class_set(
    class_id: UUID,
    body: ClassSetAdd,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassSetOut:
    return await ClassroomService(db).share_set(user, class_id, body)


@router.delete(
    "/{class_id}/sets/{set_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Убрать набор из класса",
)
async def unshare_class_set(
    class_id: UUID,
    set_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ClassroomService(db).unshare_set(user, class_id, set_id)


@router.get("/{class_id}/assignments", response_model=list[AssignmentOut], summary="Задания класса")
async def list_class_assignments(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssignmentOut]:
    return await ClassroomService(db).list_assignments(user, class_id)


@router.post(
    "/{class_id}/assignments",
    response_model=AssignmentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать задание",
)
async def create_class_assignment(
    class_id: UUID,
    body: AssignmentCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> AssignmentOut:
    return await ClassroomService(db).create_assignment(user, class_id, body)


@router.get(
    "/{class_id}/reports",
    response_model=ClassReportOut,
    summary="Сводный отчёт класса",
)
async def get_class_report(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassReportOut:
    return await ClassroomService(db).class_report(user, class_id)


@router.get(
    "/{class_id}/reports/students/{student_id}",
    response_model=StudentReportOut,
    summary="Отчёт по ученику",
)
async def get_class_student_report(
    class_id: UUID,
    student_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> StudentReportOut:
    return await ClassroomService(db).student_report(user, class_id, student_id)


@router.get(
    "/{class_id}/reports/cards",
    response_model=ClassCardReportOut,
    summary="Ошибки по карточкам класса",
)
async def get_class_card_report(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassCardReportOut:
    return await ClassroomService(db).card_report(user, class_id)


@router.get(
    "/{class_id}/reports.xlsx",
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}
            },
            "description": "Отчёт класса в XLSX",
        }
    },
    summary="Выгрузить отчёт класса в XLSX",
)
async def export_class_report(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    service = ClassroomService(db)
    classroom = await service.get(user, class_id)
    report = await service.class_report(user, class_id)
    content = build_class_report_xlsx(report, classroom.title)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="remora-class-report.xlsx"'},
    )
