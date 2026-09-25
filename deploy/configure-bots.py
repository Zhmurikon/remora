"""Явный перенос только реквизитов ботов из локального .env на home-server."""

import json
import subprocess
from pathlib import Path

from dotenv import dotenv_values


def main() -> None:
    source = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    names = ["TG_BOT_TOKEN", "VK_GROUP_TOKEN", "VK_CALLBACK_URL_TOKEN", "VK_GROUP_ID"]
    values = {key: source.get(key) or "" for key in names}
    assert all(values.values()), "Не хватает переменных ботов в локальном .env"
    assert source.get("VK_CALLBACK_URL") == "https://remora.com.ru/callback/vk_v1/", (
        "Проверьте адрес Callback VK"
    )
    # Данные идут по stdin SSH, а не через аргументы процессов или журналы.
    script = r'''
import json,sys,secrets,os
from pathlib import Path
from dotenv import dotenv_values
import httpx
data=json.load(sys.stdin)
try:
    with httpx.Client(timeout=20,trust_env=False) as client:
        result=client.post("https://api.vk.com/method/groups.getById",data={"access_token":data["VK_GROUP_TOKEN"],"v":"5.199"}).json()
        groups=result.get("response",[])
        if isinstance(groups,dict): groups=groups.get("groups",[])
        if not any(str(g["id"])==data["VK_GROUP_ID"] for g in groups): raise ValueError("VK token/group mismatch")
        confirmation=client.post(
            "https://api.vk.com/method/groups.getCallbackConfirmationCode",
            data={"access_token":data["VK_GROUP_TOKEN"],"group_id":data["VK_GROUP_ID"],"v":"5.199"},
        ).json()
        data["VK_CONFIRMATION_CODE"]=confirmation["response"]["code"]
        try:
            with httpx.Client(timeout=20,trust_env=False,proxy="socks5h://host.docker.internal:9999") as telegram:
                result=telegram.post("https://api.telegram.org/bot"+data["TG_BOT_TOKEN"]+"/getMe").json()
            if not result.get("ok"): raise ValueError("TG token rejected")
            data["TG_BOT_USERNAME"]=result["result"]["username"]
        except httpx.HTTPError:
            data["TG_BOT_USERNAME"]=""
            print("Telegram connectivity unavailable; token not verified")
except Exception as exc:
    raise SystemExit("Bot validation failed: "+type(exc).__name__) from None
root=Path("/workspace/deploy")
main=root/".env"
existing=dotenv_values(main)
def stable(name):
    return existing.get(name) or secrets.token_urlsafe(32)
tg=stable("BOT_TG_SERVICE_TOKEN")
vk=stable("BOT_VK_SERVICE_TOKEN")
old_tg=dotenv_values(root/".env.telegram") if (root/".env.telegram").exists() else {}
webhook=old_tg.get("TG_WEBHOOK_SECRET") or secrets.token_urlsafe(32)
def merge(path,updates):
    lines=path.read_text().splitlines() if path.exists() else []
    lines=[line for line in lines if line.split("=",1)[0] not in updates]
    for key,value in updates.items():
        if "\n" in value or "\r" in value or "'" in value: raise ValueError("Invalid value")
        lines.append(key+"='"+value+"'")
    temp=path.with_name(path.name+".tmp")
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,"w") as f: f.write("\n".join(lines)+"\n")
    temp.replace(path)
merge(main,{"TG_BOT_USERNAME":data["TG_BOT_USERNAME"],"VK_GROUP_ID":data["VK_GROUP_ID"],"BOT_TG_SERVICE_TOKEN":tg,"BOT_VK_SERVICE_TOKEN":vk})
merge(root/".env.telegram",{"BOT_PLATFORM":"telegram","BOT_SERVICE_TOKEN":tg,"BOT_INTERNAL_URL":"http://bot-api:8000","TG_BOT_TOKEN":data["TG_BOT_TOKEN"],"TG_WEBHOOK_SECRET":webhook})
merge(root/".env.vk",{"BOT_PLATFORM":"vk","BOT_SERVICE_TOKEN":vk,"BOT_INTERNAL_URL":"http://bot-api:8000",**{k:data[k] for k in ("VK_GROUP_TOKEN","VK_GROUP_ID","VK_CALLBACK_URL_TOKEN","VK_CONFIRMATION_CODE")}})
print("Bot environment configured; secrets not displayed")
if data["TG_BOT_USERNAME"]: print("Telegram: https://t.me/"+data["TG_BOT_USERNAME"])
'''
    import shlex
    command = "docker run --rm -i --add-host host.docker.internal:host-gateway -v /opt/remora-dev:/workspace -v remora-dev_python-deps:/opt/venv:ro remora-dev-api:local python -c " + shlex.quote(script)
    subprocess.run(["ssh", "home-server", command], input=json.dumps(values), text=True, check=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Трассировка HTTP-клиента может содержать токен Telegram в URL.
        raise SystemExit("Настройка ботов не выполнена: " + type(exc).__name__) from None
