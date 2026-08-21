from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from passlib.context import CryptContext
import urllib.parse
import psycopg
from psycopg.rows import dict_row
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 1. Tratamento seguro de credenciais e URL de conexão
usuario = "fabricio"
senha_segura = urllib.parse.quote_plus("Myfab@123")
host = "179.198.119.225"
porta = "5432"
banco = "qcsoftware"

# Adicionado '+psycopg' para coincidir com a dependência psycopg v3
SQLALCHEMY_DATABASE_URL = (
    f"postgresql+psycopg://{usuario}:{senha_segura}@{host}:{porta}/{banco}"
)

# 2. Configuração do Engine e Sessão
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,  # Testa a conexão antes de usar (evita conexões caindo)
    pool_recycle=300,    # Recicla conexões a cada 5 minutos
    connect_args={"sslmode": "prefer"}  # Aceita SSL se disponível, se não usa sem SSL
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Contexto para hashing seguro de senhas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def gerar_hash_senha(senha: str) -> str:
    return pwd_context.hash(senha)

def verificar_senha(senha_pura: str, senha_hash: str) -> bool:
    return pwd_context.verify(senha_pura, senha_hash)

def get_db():
    conn = psycopg.connect(
        dbname=banco,
        user=usuario,
        password="Myfab@123",
        host=host,
        port=porta,
        row_factory=dict_row
    )
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Tabela colaboradores (Importante para evitar Foreign Key Error)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS colaboradores (
        id_colaboradores SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Tabela perfis
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS perfis (
        id_perfis SERIAL PRIMARY KEY,
        nome VARCHAR(50) NOT NULL,
        data_criacao TIMESTAMP WITH TIME ZONE NOT NULL,
        data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE
    );
    """)

    # 3. Tabela tela
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tela (
        id_telas SERIAL PRIMARY KEY,
        nome VARCHAR(50) NOT NULL,
        data_criacao TIMESTAMP WITH TIME ZONE NOT NULL,
        data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE
    );
    """)

    # 4. Tabela usuarios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id_usuarios SERIAL PRIMARY KEY,
        usuario VARCHAR(100) NOT NULL UNIQUE,
        id_colaboradores INTEGER NOT NULL REFERENCES colaboradores(id_colaboradores),
        id_perfis INTEGER NOT NULL REFERENCES perfis(id_perfis),
        email VARCHAR(100) NOT NULL UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        data_criacao TIMESTAMP WITH TIME ZONE NOT NULL,
        data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE
    );
    """)

    # 5. Tabela permissoes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS permissoes (
        id_permissoes SERIAL PRIMARY KEY,
        id_perfis INTEGER NOT NULL REFERENCES perfis(id_perfis),
        id_telas INTEGER NOT NULL REFERENCES tela(id_telas),
        visualizar BOOLEAN NOT NULL DEFAULT FALSE,
        inserir BOOLEAN NOT NULL DEFAULT FALSE,
        alterar BOOLEAN NOT NULL DEFAULT FALSE,
        excluir BOOLEAN NOT NULL DEFAULT FALSE,
        data_criacao TIMESTAMP WITH TIME ZONE NOT NULL,
        data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE(id_perfis, id_telas)
    );
    """)

    # 6. Tabela auditoria
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS auditoria (
        id_auditoria SERIAL PRIMARY KEY,
        id_usuarios INTEGER,
        metodo VARCHAR(10) NOT NULL,
        rota VARCHAR(255) NOT NULL,
        ip_origem VARCHAR(50) NOT NULL,
        payload TEXT,
        data_hora TIMESTAMP WITH TIME ZONE NOT NULL
    );
    """)

    # --- INICIALIZAÇÃO DE DADOS PADRÃO ---

    # Garantir colaboradores iniciais
    cursor.execute("SELECT COUNT(*) FROM colaboradores;")
    row_colab = cursor.fetchone()
    count_colab = list(row_colab.values())[0] if row_colab else 0
    if count_colab == 0:
        cursor.execute("INSERT INTO colaboradores (id_colaboradores, nome) VALUES (1, 'Administrador');")
        cursor.execute("INSERT INTO colaboradores (id_colaboradores, nome) VALUES (43, 'Fabricio Oliveira');")

    # Garantir Perfis e Telas
    cursor.execute("SELECT COUNT(*) FROM perfis;")
    row = cursor.fetchone()
    count = list(row.values())[0] if row else 0

    if count == 0:
        now = datetime.utcnow()
        cursor.execute("INSERT INTO perfis (nome, ativo, data_criacao, data_atualizacao) VALUES ('Administrador', TRUE, %s, %s)", (now, now))
        cursor.execute("INSERT INTO perfis (nome, ativo, data_criacao, data_atualizacao) VALUES ('Operador', TRUE, %s, %s)", (now, now))

        cursor.execute("INSERT INTO tela (nome, ativo, data_criacao, data_atualizacao) VALUES ('Ocorrências', TRUE, %s, %s)", (now, now))
        cursor.execute("INSERT INTO tela (nome, ativo, data_criacao, data_atualizacao) VALUES ('Usuários', TRUE, %s, %s)", (now, now))
        cursor.execute("INSERT INTO tela (nome, ativo, data_criacao, data_atualizacao) VALUES ('Perfis', TRUE, %s, %s)", (now, now))
        cursor.execute("INSERT INTO tela (nome, ativo, data_criacao, data_atualizacao) VALUES ('Permissões', TRUE, %s, %s)", (now, now))

        senha_admin = gerar_hash_senha("admin123")
        cursor.execute("""
        INSERT INTO usuarios (usuario, id_colaboradores, id_perfis, email, senha_hash, data_criacao, data_atualizacao, ativo)
        VALUES ('fabricio.oliveira', 43, 1, 'fabricio.oliveira@qcsoftware.com.br', %s, %s, %s, TRUE)
        ON CONFLICT (usuario) DO NOTHING;
        """, (senha_admin, now, now))

    conn.commit()
    cursor.close()
    conn.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Q.C Software - API Backend", lifespan=lifespan)

origins = [
    "https://sistema.qcsoftware.com.br",
    "https://qcsoftware.tech",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MIDDLEWARE DE AUDITORIA ---
@app.middleware("http")
async def audit_logger_middleware(request: Request, call_next):
    payload = "{}"
    
    # 1. Captura o payload ANTES de chamar o próximo handler (evita consumir stream consumida)
    if request.method in ["POST", "PUT", "DELETE"]:
        try:
            body_bytes = await request.body()
            if body_bytes:
                payload = body_bytes.decode("utf-8")
        except Exception as body_err:
            print(f"[AVISO AUDITORIA - BODY]: {body_err}")

    # 2. Executa a requisição
    response = await call_next(request)

    # 3. Se a operação foi de alteração e bem-sucedida, grava no banco
    if request.method in ["POST", "PUT", "DELETE"] and response.status_code < 400:
        # Obter IP real do cliente através do proxy do Render
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # Pega o primeiro IP da lista (IP original do usuário)
            client_ip = forwarded_for.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"

        now = datetime.now(timezone.utc)
        
        try:
            conn = get_db() 
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO auditoria (metodo, rota, ip_origem, payload, data_hora)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                request.method,
                str(request.url.path),
                client_ip,
                payload,
                now
            ))
            conn.commit()
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"[ERRO AUDITORIA]: {e}")

    return response


# --- SCHEMAS ---

class TelaSchema(BaseModel):
    nome: str

class PerfilSchema(BaseModel):
    nome: str

class UsuarioCriarSchema(BaseModel):
    usuario: str
    email: EmailStr
    senha: str
    id_colaboradores: int
    id_perfis: int

class UsuarioEditarSchema(BaseModel):
    usuario: str
    email: EmailStr
    senha: Optional[str] = None
    id_colaboradores: int
    id_perfis: int

class LoginSchema(BaseModel):
    usuario_ou_email: str
    senha: str

class PermissaoItemSchema(BaseModel):
    id_telas: int
    visualizar: bool
    inserir: bool
    alterar: bool
    excluir: bool

class SalvarPermissoesSchema(BaseModel):
    id_perfis: int
    permissoes: List[PermissaoItemSchema]


# --- ROTAS DA API ---

@app.post("/api/auth/login")
async def login(dados: LoginSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.id_usuarios, u.usuario, u.senha_hash, u.id_perfis, p.nome as perfil_nome
    FROM usuarios u
    LEFT JOIN perfis p ON u.id_perfis = p.id_perfis
    WHERE (u.usuario = %s OR u.email = %s) AND u.ativo = TRUE;
    """, (dados.usuario_ou_email, dados.usuario_ou_email))
    
    usr = cursor.fetchone()
    cursor.close()
    conn.close()

    if not usr or not verificar_senha(dados.senha, usr["senha_hash"]):
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")

    return {
        "mensagem": "Autenticado com sucesso!",
        "usuario": {"id": usr["id_usuarios"], "usuario": usr["usuario"], "perfil": usr["perfil_nome"]}
    }

# --- USUÁRIOS ---
@app.get("/api/usuarios")
async def listar_usuarios():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.id_usuarios, u.usuario, u.email, u.id_colaboradores, u.id_perfis, p.nome as nome_perfil
    FROM usuarios u
    LEFT JOIN perfis p ON u.id_perfis = p.id_perfis
    WHERE u.ativo = TRUE ORDER BY u.id_usuarios ASC;
    """)
    usuarios = [dict(row) for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return usuarios

@app.post("/api/usuarios", status_code=status.HTTP_201_CREATED)
async def criar_usuario(dados: UsuarioCriarSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    hash_senha = gerar_hash_senha(dados.senha)

    try:
        cursor.execute("""
        INSERT INTO usuarios (usuario, id_colaboradores, id_perfis, email, senha_hash, data_criacao, data_atualizacao, ativo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE) RETURNING id_usuarios;
        """, (dados.usuario, dados.id_colaboradores, dados.id_perfis, dados.email, hash_senha, now, now))
        row = cursor.fetchone()
        id_gerado = list(row.values())[0]
        conn.commit()
    except psycopg.Error as e:
        conn.rollback()
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail=f"Erro ao criar usuário: {str(e)}")

    cursor.close()
    conn.close()
    return {"id_usuarios": id_gerado, "usuario": dados.usuario}

@app.put("/api/usuarios/{id_usuarios}")
async def editar_usuario(id_usuarios: int, dados: UsuarioEditarSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()

    if dados.senha and dados.senha.strip():
        hash_senha = gerar_hash_senha(dados.senha)
        cursor.execute("""
        UPDATE usuarios 
        SET usuario = %s, email = %s, senha_hash = %s, id_colaboradores = %s, id_perfis = %s, data_atualizacao = %s
        WHERE id_usuarios = %s AND ativo = TRUE;
        """, (dados.usuario, dados.email, hash_senha, dados.id_colaboradores, dados.id_perfis, now, id_usuarios))
    else:
        cursor.execute("""
        UPDATE usuarios 
        SET usuario = %s, email = %s, id_colaboradores = %s, id_perfis = %s, data_atualizacao = %s
        WHERE id_usuarios = %s AND ativo = TRUE;
        """, (dados.usuario, dados.email, dados.id_colaboradores, dados.id_perfis, now, id_usuarios))

    if cursor.rowcount == 0:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Usuário atualizado com sucesso!"}

@app.delete("/api/usuarios/{id_usuarios}")
async def excluir_usuario(id_usuarios: int):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("UPDATE usuarios SET ativo = FALSE, data_atualizacao = %s WHERE id_usuarios = %s", (now, id_usuarios))
    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Usuário inativado!"}

# --- TELAS (Rotas Duplas para Compatibilidade) ---
@app.get("/api/telas")
@app.get("/tela/")
@app.get("/api/tela")
async def listar_telas():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id_telas, nome, ativo FROM tela WHERE ativo = TRUE ORDER BY id_telas ASC;")
    telas = [dict(row) for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return telas

@app.post("/api/telas", status_code=status.HTTP_201_CREATED)
@app.post("/tela/")
async def criar_tela(dados: TelaSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("INSERT INTO tela (nome, data_criacao, data_atualizacao, ativo) VALUES (%s, %s, %s, TRUE) RETURNING id_telas;", (dados.nome, now, now))
    row = cursor.fetchone()
    id_gerado = list(row.values())[0]
    conn.commit()
    cursor.close()
    conn.close()
    return {"id_telas": id_gerado, "nome": dados.nome}

@app.put("/api/telas/{id_telas}")
@app.put("/tela/{id_telas}")
async def editar_tela(id_telas: int, dados: TelaSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("UPDATE tela SET nome = %s, data_atualizacao = %s WHERE id_telas = %s AND ativo = TRUE", (dados.nome, now, id_telas))
    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Tela atualizada!"}

@app.delete("/api/telas/{id_telas}")
@app.delete("/tela/{id_telas}")
async def excluir_tela(id_telas: int):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("UPDATE tela SET ativo = FALSE, data_atualizacao = %s WHERE id_telas = %s", (now, id_telas))
    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Tela inativada!"}

# --- PERFIS ---
@app.get("/api/perfis")
async def listar_perfis():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id_perfis, nome FROM perfis WHERE ativo = TRUE ORDER BY id_perfis ASC;")
    perfis = [dict(row) for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return perfis

@app.post("/api/perfis", status_code=status.HTTP_201_CREATED)
async def criar_perfil(dados: PerfilSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("INSERT INTO perfis (nome, data_criacao, data_atualizacao, ativo) VALUES (%s, %s, %s, TRUE) RETURNING id_perfis;", (dados.nome, now, now))
    row = cursor.fetchone()
    id_gerado = list(row.values())[0]
    conn.commit()
    cursor.close()
    conn.close()
    return {"id_perfis": id_gerado, "nome": dados.nome}

@app.put("/api/perfis/{id_perfis}")
async def editar_perfil(id_perfis: int, dados: PerfilSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("UPDATE perfis SET nome = %s, data_atualizacao = %s WHERE id_perfis = %s AND ativo = TRUE", (dados.nome, now, id_perfis))
    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Perfil atualizado!"}

@app.delete("/api/perfis/{id_perfis}")
async def excluir_perfil(id_perfis: int):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()
    cursor.execute("UPDATE perfis SET ativo = FALSE, data_atualizacao = %s WHERE id_perfis = %s", (now, id_perfis))
    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Perfil inativado!"}

# --- PERMISSÕES ---
@app.get("/api/permissoes/perfil/{id_perfis}")
async def buscar_permissoes_perfil(id_perfis: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id_permissoes, id_perfis, id_telas, visualizar, inserir, alterar, excluir FROM permissoes WHERE id_perfis = %s AND ativo = TRUE;", (id_perfis,))
    permissoes = [dict(row) for row in cursor.fetchall()]
    cursor.close()
    conn.close()
    return permissoes

@app.post("/api/permissoes/salvar")
async def salvar_permissoes(payload: SalvarPermissoesSchema):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.utcnow()

    for p in payload.permissoes:
        cursor.execute("""
        INSERT INTO permissoes (id_perfis, id_telas, visualizar, inserir, alterar, excluir, data_criacao, data_atualizacao, ativo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)
        ON CONFLICT(id_perfis, id_telas) DO UPDATE SET
            visualizar = EXCLUDED.visualizar,
            inserir = EXCLUDED.inserir,
            alterar = EXCLUDED.alterar,
            excluir = EXCLUDED.excluir,
            data_atualizacao = EXCLUDED.data_atualizacao;
        """, (payload.id_perfis, p.id_telas, p.visualizar, p.inserir, p.alterar, p.excluir, now, now))

    conn.commit()
    cursor.close()
    conn.close()
    return {"mensagem": "Permissões salvas!"}

# --- ESTRUTURA FRONTEND ---
@app.get("/")
async def carregar_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")