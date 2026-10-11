"""
My work (saved circuits, projects, challenge stars) — test suite.

Run from backend/:  python -m pytest tests/test_work.py -v

Signed-in users can save circuits from the Circuit Builder or the Simulator,
group them into projects, and keep their challenge stars. Nobody can see or
change another user's work, and all of it goes when the account does.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password, token_for
from app.database import SessionLocal
from app.models.user import User, ROLE_USER
from app.models.work import ChallengeProgress, Project, SavedCircuit

BELL = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0], q[1];\nmeasure q -> c;\n'
LAYOUT = {"n": 2, "gates": [{"id": "a", "gate": "H", "col": 0, "target": 0, "controls": []},
                            {"id": "b", "gate": "CNOT", "col": 1, "target": 1, "controls": [0]}]}


@pytest.fixture(scope="module")
def client():
    from main import app
    return TestClient(app)


def _user() -> tuple[int, dict]:
    tag = uuid.uuid4().hex[:10]
    db = SessionLocal()
    u = User(username=f"work_{tag}", email=f"work_{tag}@example.com", hashed_password=hash_password("TestPass123"),
             role=ROLE_USER, is_active=True)
    db.add(u); db.commit(); db.refresh(u)
    uid, headers = u.id, {"Authorization": f"Bearer {token_for(u)}"}
    db.close()
    return uid, headers


def _delete_user(uid: int) -> None:
    db = SessionLocal()
    db.query(User).filter(User.id == uid).delete()
    db.commit(); db.close()


@pytest.fixture
def me():
    uid, headers = _user()
    yield headers
    _delete_user(uid)


@pytest.fixture
def someone_else():
    uid, headers = _user()
    yield headers
    _delete_user(uid)


def test_everything_needs_sign_in(client):
    for method, url in [("get", "/api/work/circuits"), ("post", "/api/work/circuits"), ("get", "/api/work/projects"),
                        ("get", "/api/work/challenges"), ("delete", "/api/work/circuits/1")]:
        assert getattr(client, method)(url).status_code in (401, 403), url


def test_save_list_open_and_autosave_a_circuit(client, me):
    r = client.post("/api/work/circuits", headers=me, json={"name": "  My Bell pair  ", "qasm": BELL, "layout": LAYOUT})
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["name"] == "My Bell pair" and c["n_qubits"] == 2 and c["gate_count"] == 2 and c["opens_in"] == "builder"
    listed = client.get("/api/work/circuits", headers=me).json()
    assert [x["id"] for x in listed] == [c["id"]] and "qasm" not in listed[0]       # the list stays light
    changed = BELL.replace("cx q[0], q[1];", "cx q[0], q[1];\nx q[1];")
    r = client.patch(f"/api/work/circuits/{c['id']}", headers=me, json={"qasm": changed})
    assert r.status_code == 200 and r.json()["gate_count"] == 3
    opened = client.get(f"/api/work/circuits/{c['id']}", headers=me).json()
    assert opened["qasm"] == changed and opened["layout"] == LAYOUT


def test_a_circuit_with_a_mistake_is_still_saved(client, me):
    c = client.post("/api/work/circuits", headers=me, json={"name": "Half done", "qasm": BELL + "foo q[0];\n"}).json()
    assert c["n_qubits"] is None and c["gate_count"] is None and c["opens_in"] == "simulator"


def test_newest_first_and_a_limit(client, me):
    ids = [client.post("/api/work/circuits", headers=me, json={"name": f"c{i}", "qasm": BELL}).json()["id"] for i in range(3)]
    client.patch(f"/api/work/circuits/{ids[0]}", headers=me, json={"name": "edited"})
    assert [c["id"] for c in client.get("/api/work/circuits", headers=me, params={"limit": 2}).json()] == [ids[0], ids[2]]


def test_copy_rename_and_delete(client, me):
    c = client.post("/api/work/circuits", headers=me, json={"name": "Original", "qasm": BELL}).json()
    copy = client.post(f"/api/work/circuits/{c['id']}/copy", headers=me).json()
    assert copy["name"] == "Copy of Original" and copy["qasm"] == BELL and copy["id"] != c["id"]
    assert client.patch(f"/api/work/circuits/{copy['id']}", headers=me, json={"name": "Renamed"}).json()["name"] == "Renamed"
    assert client.delete(f"/api/work/circuits/{c['id']}", headers=me).status_code == 204
    assert client.get(f"/api/work/circuits/{c['id']}", headers=me).status_code == 404


def test_projects_group_circuits_and_keep_them_when_deleted(client, me):
    p = client.post("/api/work/projects", headers=me, json={"name": "Grover experiments", "description": "Search tests"}).json()
    inside = client.post("/api/work/circuits", headers=me, json={"name": "In", "qasm": BELL, "project_id": p["id"]}).json()
    outside = client.post("/api/work/circuits", headers=me, json={"name": "Out", "qasm": BELL}).json()
    projects = client.get("/api/work/projects", headers=me).json()
    assert projects[0]["name"] == "Grover experiments" and projects[0]["circuit_count"] == 1
    assert [c["id"] for c in client.get("/api/work/circuits", headers=me, params={"project": p["id"]}).json()] == [inside["id"]]
    assert [c["id"] for c in client.get("/api/work/circuits", headers=me, params={"project": "none"}).json()] == [outside["id"]]
    # move one in, take one out
    client.patch(f"/api/work/circuits/{outside['id']}", headers=me, json={"project_id": p["id"]})
    client.patch(f"/api/work/circuits/{inside['id']}", headers=me, json={"project_id": None})
    assert [c["id"] for c in client.get("/api/work/circuits", headers=me, params={"project": p["id"]}).json()] == [outside["id"]]
    # deleting the project keeps its circuits
    assert client.delete(f"/api/work/projects/{p['id']}", headers=me).status_code == 204
    left = client.get("/api/work/circuits", headers=me).json()
    assert {c["id"] for c in left} == {inside["id"], outside["id"]} and all(c["project_id"] is None for c in left)


def test_rename_and_describe_a_project(client, me):
    p = client.post("/api/work/projects", headers=me, json={"name": "Draft"}).json()
    r = client.patch(f"/api/work/projects/{p['id']}", headers=me, json={"name": "Final", "description": "Done"})
    assert r.json()["name"] == "Final" and r.json()["description"] == "Done"


def test_nobody_sees_or_touches_another_users_work(client, me, someone_else):
    p = client.post("/api/work/projects", headers=me, json={"name": "Mine"}).json()
    c = client.post("/api/work/circuits", headers=me, json={"name": "Mine", "qasm": BELL, "project_id": p["id"]}).json()
    assert client.get("/api/work/circuits", headers=someone_else).json() == []
    assert client.get("/api/work/projects", headers=someone_else).json() == []
    assert client.get(f"/api/work/circuits/{c['id']}", headers=someone_else).status_code == 404
    assert client.patch(f"/api/work/circuits/{c['id']}", headers=someone_else, json={"name": "x"}).status_code == 404
    assert client.delete(f"/api/work/circuits/{c['id']}", headers=someone_else).status_code == 404
    assert client.post(f"/api/work/circuits/{c['id']}/copy", headers=someone_else).status_code == 404
    assert client.delete(f"/api/work/projects/{p['id']}", headers=someone_else).status_code == 404
    # nor file a circuit into someone else's project
    r = client.post("/api/work/circuits", headers=someone_else, json={"name": "x", "qasm": BELL, "project_id": p["id"]})
    assert r.status_code == 404


@pytest.mark.parametrize("body", [
    {"name": "", "qasm": BELL},
    {"name": "   ", "qasm": BELL},
    {"name": "x" * 101, "qasm": BELL},
    {"name": "ok", "qasm": "x" * 200_001},
    {"name": "ok", "qasm": BELL, "layout": {"n": 9, "gates": []}},
    {"name": "ok", "qasm": BELL, "layout": {"n": 2, "gates": "nope"}},
])
def test_bad_saves_are_refused(client, me, body):
    assert client.post("/api/work/circuits", headers=me, json=body).status_code == 422


def test_challenge_stars_keep_the_best(client, me):
    assert client.get("/api/work/challenges", headers=me).json() == {"levels": {}}
    client.post("/api/work/challenges", headers=me, json={"levels": {"bell": 2, "flip": 3}})
    r = client.post("/api/work/challenges", headers=me, json={"levels": {"bell": 1, "ghz": 3}})
    assert r.json() == {"levels": {"bell": 2, "flip": 3, "ghz": 3}}
    assert client.post("/api/work/challenges", headers=me, json={"levels": {"nope": 1}}).status_code == 422
    assert client.post("/api/work/challenges", headers=me, json={"levels": {"bell": 4}}).status_code == 422


def test_deleting_the_account_erases_its_work(client):
    uid, headers = _user()
    p = client.post("/api/work/projects", headers=headers, json={"name": "P"}).json()
    client.post("/api/work/circuits", headers=headers, json={"name": "C", "qasm": BELL, "project_id": p["id"]})
    client.post("/api/work/challenges", headers=headers, json={"levels": {"bell": 3}})
    _delete_user(uid)
    db = SessionLocal()
    try:
        assert db.query(SavedCircuit).filter(SavedCircuit.user_id == uid).count() == 0
        assert db.query(Project).filter(Project.user_id == uid).count() == 0
        assert db.query(ChallengeProgress).filter(ChallengeProgress.user_id == uid).count() == 0
    finally:
        db.close()
