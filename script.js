const API_BASE = "https://sistema.qcsoftware.com.br";

document.addEventListener("DOMContentLoaded", () => {
    carregarUsuarios();
    carregarPerfis();
    carregarTelas();
    carregarSelectColaboradores();
});

// Helper seguro para tratar respostas HTTP
async function tratarResposta(res, acao, exibirSucesso = false) {
    if (res.ok) {
        if (exibirSucesso) {
            alert(`${acao.charAt(0).toUpperCase() + acao.slice(1)} com sucesso!`);
        }
        if (res.status === 204) return {};
        return await res.json().catch(() => ({}));
    }
    
    let detalhe = "";
    try {
        const textoResposta = await res.text();
        try {
            const errJson = JSON.parse(textoResposta);
            if (errJson.detail) {
                detalhe = typeof errJson.detail === "object" ? JSON.stringify(errJson.detail) : errJson.detail;
            } else {
                detalhe = JSON.stringify(errJson);
            }
        } catch (_) {
            detalhe = textoResposta;
        }
    } catch (e) {
        detalhe = "Erro desconhecido no servidor.";
    }

    console.error(`Erro ao ${acao} [HTTP ${res.status}]:`, detalhe);
    alert(`Erro ao ${acao}: ${detalhe || 'Falha de comunicação com o servidor'}`);
    return null;
}

// Helper para fazer Fetch com retentativa inteligente (evita poluir console com 404/405)
async function fetchInteligente(urlPrincipal, urlAlternativa, opcoes = {}) {
    let res = await fetch(urlPrincipal, opcoes);
    if (!res.ok && (res.status === 404 || res.status === 405) && urlAlternativa) {
        res = await fetch(urlAlternativa, opcoes);
    }
    return res;
}

// --- COLABORADORES ---
async function carregarSelectColaboradores() {
    const select = document.getElementById("usr-colaborador");
    if (!select) return;

    try {
        const res = await fetchInteligente(`${API_BASE}/colaboradores/`, `${API_BASE}/colaboradores`);
        if (!res.ok) throw new Error(`Status HTTP: ${res.status}`);

        const colaboradores = await res.json();
        select.innerHTML = `<option value="">Selecione um colaborador...</option>`;

        if (!Array.isArray(colaboradores) || colaboradores.length === 0) {
            select.innerHTML = `<option value="">Nenhum colaborador encontrado</option>`;
            return;
        }

        colaboradores.forEach(c => {
            const idColab = c.id_colaboradores ?? c.id;
            const nomeColab = c.nome ?? c.nome_colaborador ?? `Colaborador #${idColab}`;
            
            if (idColab) {
                const option = document.createElement("option");
                option.value = idColab;
                option.textContent = nomeColab;
                select.appendChild(option);
            }
        });
    } catch (err) {
        console.error("Erro ao carregar colaboradores:", err);
        select.innerHTML = `<option value="">Erro ao carregar lista de colaboradores</option>`;
    }
}

// --- NAVEGAÇÃO DE ABAS ---
function mudarAba(idAba) {
    document.querySelectorAll(".aba-conteudo").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(el => {
        el.classList.remove("border-blue-600", "font-bold", "text-blue-600");
        el.classList.add("border-transparent", "text-gray-500");
    });

    const abaAlvo = document.getElementById(idAba);
    if (abaAlvo) abaAlvo.classList.remove("hidden");

    const btnAtivo = document.getElementById(`btn-${idAba}`);
    if (btnAtivo) {
        btnAtivo.classList.remove("border-transparent", "text-gray-500");
        btnAtivo.classList.add("border-blue-600", "font-bold", "text-blue-600");
    }

    if (idAba === 'aba-permissoes') {
        carregarSelectPerfisPermissoes();
    }
}

// --- USUÁRIOS ---
async function carregarUsuarios() {
    try {
        // 1. Busca mapeamento de perfis
        let mapaPerfis = {};
        try {
            const resPerfis = await fetchInteligente(`${API_BASE}/perfis/`, `${API_BASE}/perfis`);
            if (resPerfis.ok) {
                const perfis = await resPerfis.json();
                if (Array.isArray(perfis)) {
                    perfis.forEach(p => {
                        mapaPerfis[p.id_perfis || p.id] = p.nome;
                    });
                }
            }
        } catch (e) {
            console.warn("Aviso ao carregar lista de perfis para mapeamento:", e);
        }

        // 2. Busca usuários
        const res = await fetchInteligente(`${API_BASE}/usuarios/`, `${API_BASE}/usuarios`);
        if (!res.ok) throw new Error(`Status HTTP: ${res.status}`);
        const usuarios = await res.json();
        
        const tbody = document.getElementById("tbl-usuarios");
        tbody.innerHTML = "";

        if (!usuarios || usuarios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum usuário encontrado.</td></tr>`;
            return;
        }

        usuarios.forEach(u => {
            const userJson = JSON.stringify(u).replace(/'/g, "&apos;");
            const isAtivo = u.ativo !== false;
            const badgeAtivo = isAtivo 
                ? `<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-medium">Ativo</span>`
                : `<span class="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded font-medium">Inativo</span>`;

            const nomePerfil = u.nome_perfil || u.perfil || u.perfil_nome || mapaPerfis[u.id_perfis] || 'N/A';

            tbody.innerHTML += `
                <tr class="border-b hover:bg-slate-50 ${!isAtivo ? 'opacity-60 bg-slate-100' : ''}">
                    <td class="p-2 border text-slate-600">${u.id_usuarios}</td>
                    <td class="p-2 border font-medium text-slate-800">${u.usuario}</td>
                    <td class="p-2 border text-slate-600 font-medium">${nomePerfil}</td>
                    <td class="p-2 border text-center">${badgeAtivo}</td>
                    <td class="p-2 border text-center space-x-1">
                        <button onclick='preencherEditarUsuario(${userJson})' 
                                title="Editar"
                                class="bg-emerald-600 hover:bg-emerald-700 !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi bi-pencil-square"></i> Editar
                        </button>
                        <button onclick="excluirUsuario(${u.id_usuarios})" 
                                title="Excluir Definitivamente"
                                class="bg-red-600 hover:bg-red-700 !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi bi-trash"></i> Excluir
                        </button>
                        <button onclick='inativarUsuario(${userJson})' 
                                title="${isAtivo ? 'Inativar' : 'Ativar'}"
                                class="${isAtivo ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'} !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi ${isAtivo ? 'bi-pause-circle' : 'bi-play-circle'}"></i> ${isAtivo ? 'Inativar' : 'Ativar'}
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Erro ao carregar usuários:", err);
    }
}

async function salvarUsuario(e) {
    e.preventDefault();
    const id = document.getElementById("usr-id").value;
    const usuario = document.getElementById("usr-usuario").value.trim();
    const email = document.getElementById("usr-email").value.trim();
    const senha = document.getElementById("usr-senha").value;
    const valColab = document.getElementById("usr-colaborador").value;
    const valPerfil = document.getElementById("usr-perfil").value;

    const payload = { 
        usuario, 
        email, 
        id_colaboradores: valColab ? parseInt(valColab) : null, 
        id_perfis: valPerfil ? parseInt(valPerfil) : null,
        ativo: true
    };

    if (senha && senha.trim() !== "") {
        payload.senha = senha;
    }

    const acaoTexto = id ? "usuário atualizado" : "usuário cadastrado";
    const urlP = id ? `${API_BASE}/usuarios/${id}/` : `${API_BASE}/usuarios/`;
    const urlA = id ? `${API_BASE}/usuarios/${id}` : `${API_BASE}/usuarios`;
    const method = id ? "PUT" : "POST";

    try {
        const res = await fetchInteligente(urlP, urlA, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await tratarResposta(res, acaoTexto, true);
        if (data !== null) {
            resetFormUsuario();
            carregarUsuarios();
        }
    } catch (err) {
        console.error("Erro ao salvar usuário:", err);
    }
}

function preencherEditarUsuario(u) {
    document.getElementById("usr-id").value = u.id_usuarios;
    document.getElementById("usr-usuario").value = u.usuario || "";
    document.getElementById("usr-email").value = u.email || "";
    document.getElementById("usr-colaborador").value = u.id_colaboradores || "";
    document.getElementById("usr-perfil").value = u.id_perfis || "";
    document.getElementById("usr-senha").value = "";
    document.getElementById("usr-senha-dica").classList.remove("hidden");
    document.getElementById("usr-titulo-form").innerText = "Editar Usuário";
}

function resetFormUsuario() {
    document.getElementById("form-usuario").reset();
    document.getElementById("usr-id").value = "";
    document.getElementById("usr-senha-dica").classList.add("hidden");
    document.getElementById("usr-titulo-form").innerText = "Cadastrar Usuário";
}

async function inativarUsuario(u) {
    const isAtivo = u.ativo !== false;
    const acao = isAtivo ? "inativar" : "ativar";
    if (!confirm(`Deseja realmente ${acao} este usuário?`)) return;

    const payload = {
        usuario: u.usuario,
        email: u.email,
        id_colaboradores: u.id_colaboradores || null,
        id_perfis: u.id_perfis || null,
        ativo: !isAtivo
    };

    try {
        const res = await fetchInteligente(
            `${API_BASE}/usuarios/${u.id_usuarios}/`, 
            `${API_BASE}/usuarios/${u.id_usuarios}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            }
        );
        const data = await tratarResposta(res, `${acao} usuário`, true);
        if (data !== null) carregarUsuarios();
    } catch (err) {
        console.error(`Erro ao ${acao} usuário:`, err);
    }
}

async function excluirUsuario(id) {
    if (!confirm("Deseja realmente excluir permanentemente este usuário?")) return;
    try {
        const res = await fetchInteligente(
            `${API_BASE}/usuarios/${id}/`, 
            `${API_BASE}/usuarios/${id}`, 
            { method: "DELETE" }
        );
        if (res.ok) {
            alert("Usuário excluído com sucesso!");
            carregarUsuarios();
        } else {
            await tratarResposta(res, "excluir usuário");
        }
    } catch (err) {
        console.error("Erro ao excluir usuário:", err);
    }
}

// --- PERFIS ---
async function carregarPerfis() {
    try {
        const res = await fetchInteligente(`${API_BASE}/perfis/`, `${API_BASE}/perfis`);
        if (!res.ok) throw new Error(`Status HTTP: ${res.status}`);
        const perfis = await res.json();

        const tbody = document.getElementById("tbl-perfis");
        tbody.innerHTML = "";
        
        const selectUsr = document.getElementById("usr-perfil");
        if (selectUsr) selectUsr.innerHTML = `<option value="">Selecione...</option>`;

        if (!perfis || perfis.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Nenhum perfil cadastrado.</td></tr>`;
            return;
        }

        perfis.forEach(p => {
            const perfilJson = JSON.stringify(p).replace(/'/g, "&apos;");
            const isAtivo = p.ativo !== false;
            const badgeAtivo = isAtivo 
                ? `<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-medium">Ativo</span>`
                : `<span class="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded font-medium">Inativo</span>`;

            tbody.innerHTML += `
                <tr class="border-b hover:bg-slate-50 ${!isAtivo ? 'opacity-60 bg-slate-100' : ''}">
                    <td class="p-2 border text-slate-600">${p.id_perfis}</td>
                    <td class="p-2 border font-medium text-slate-800">${p.nome}</td>
                    <td class="p-2 border text-center">${badgeAtivo}</td>
                    <td class="p-2 border text-center space-x-1">
                        <button onclick='preencherEditarPerfil(${perfilJson})' 
                                title="Editar"
                                class="bg-emerald-600 hover:bg-emerald-700 !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi bi-pencil-square"></i> Editar
                        </button>
                        <button onclick="excluirPerfil(${p.id_perfis})" 
                                title="Excluir Definitivamente"
                                class="bg-red-600 hover:bg-red-700 !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi bi-trash"></i> Excluir
                        </button>
                        <button onclick='inativarPerfil(${perfilJson})' 
                                title="${isAtivo ? 'Inativar' : 'Ativar'}"
                                class="${isAtivo ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'} !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi ${isAtivo ? 'bi-pause-circle' : 'bi-play-circle'}"></i> ${isAtivo ? 'Inativar' : 'Ativar'}
                        </button>
                    </td>
                </tr>
            `;
            if (selectUsr && isAtivo) selectUsr.innerHTML += `<option value="${p.id_perfis}">${p.nome}</option>`;
        });
    } catch (err) {
        console.error("Erro ao carregar perfis:", err);
    }
}

async function salvarPerfil(e) {
    e.preventDefault();
    const id = document.getElementById("prf-id").value;
    const nome = document.getElementById("prf-nome").value.trim();

    const acaoTexto = id ? "perfil atualizado" : "perfil cadastrado";
    const urlP = id ? `${API_BASE}/perfis/${id}/` : `${API_BASE}/perfis/`;
    const urlA = id ? `${API_BASE}/perfis/${id}` : `${API_BASE}/perfis`;
    const method = id ? "PUT" : "POST";

    try {
        const res = await fetchInteligente(urlP, urlA, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, ativo: true })
        });

        const data = await tratarResposta(res, acaoTexto, true);
        if (data !== null) {
            resetFormPerfil();
            carregarPerfis();
        }
    } catch (err) {
        console.error("Erro ao salvar perfil:", err);
    }
}

function preencherEditarPerfil(p) {
    document.getElementById("prf-id").value = p.id_perfis;
    document.getElementById("prf-nome").value = p.nome || "";
    document.getElementById("prf-titulo-form").innerText = "Editar Perfil";
}

function resetFormPerfil() {
    document.getElementById("form-perfil").reset();
    document.getElementById("prf-id").value = "";
    document.getElementById("prf-titulo-form").innerText = "Cadastrar Perfil";
}

async function inativarPerfil(p) {
    const isAtivo = p.ativo !== false;
    const acao = isAtivo ? "inativar" : "ativar";
    if (!confirm(`Deseja realmente ${acao} este perfil?`)) return;

    try {
        const res = await fetchInteligente(
            `${API_BASE}/perfis/${p.id_perfis}/`,
            `${API_BASE}/perfis/${p.id_perfis}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome: p.nome, ativo: !isAtivo })
            }
        );
        const data = await tratarResposta(res, `${acao} perfil`, true);
        if (data !== null) carregarPerfis();
    } catch (err) {
        console.error(`Erro ao ${acao} perfil:`, err);
    }
}

async function excluirPerfil(id) {
    if (!confirm("Deseja realmente excluir permanentemente este perfil?")) return;
    try {
        const res = await fetchInteligente(
            `${API_BASE}/perfis/${id}/`,
            `${API_BASE}/perfis/${id}`,
            { method: "DELETE" }
        );
        if (res.ok) {
            alert("Perfil excluído com sucesso!");
            carregarPerfis();
        } else {
            await tratarResposta(res, "excluir perfil");
        }
    } catch (err) {
        console.error("Erro ao excluir perfil:", err);
    }
}

// --- TELAS ---
async function carregarTelas() {
    try {
        const res = await fetchInteligente(
            `${API_BASE}/tela/`
        );

        const telas = await res.json();
        const tbody = document.getElementById("tbl-telas");
        tbody.innerHTML = "";

        if (!telas || telas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Nenhuma tela cadastrada.</td></tr>`;
            return;
        }

        telas.forEach(t => {
            const idTela = t.id_telas || t.id;
            const telaJson = JSON.stringify(t).replace(/'/g, "&apos;");
            const isAtivo = t.ativo !== false;
            const badgeAtivo = isAtivo 
                ? `<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-medium">Ativo</span>`
                : `<span class="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded font-medium">Inativo</span>`;

            tbody.innerHTML += `
                <tr class="border-b hover:bg-slate-50 ${!isAtivo ? 'opacity-60 bg-slate-100' : ''}">
                    <td class="p-2 border text-slate-600">${idTela}</td>
                    <td class="p-2 border font-medium text-slate-800">${t.nome}</td>
                    <td class="p-2 border text-center">${badgeAtivo}</td>
                    <td class="p-2 border text-center space-x-1">
                        <button onclick='preencherEditarTela(${telaJson})' 
                                title="Editar"
                                class="bg-emerald-600 hover:bg-emerald-700 !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi bi-pencil-square"></i> Editar
                        </button>
                        <button onclick='inativarTela(${telaJson})' 
                                title="${isAtivo ? 'Inativar' : 'Ativar'}"
                                class="${isAtivo ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'} !text-white font-semibold text-xs px-2.5 py-1 rounded inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer border-0">
                            <i class="bi ${isAtivo ? 'bi-pause-circle' : 'bi-play-circle'}"></i> ${isAtivo ? 'Inativar' : 'Ativar'}
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Erro ao carregar telas:", err);
    }
}

async function salvarTela(e) {
    e.preventDefault();
    const id = document.getElementById("tla-id").value;
    const nome = document.getElementById("tla-nome").value.trim();

    const acaoTexto = id ? "tela atualizada" : "tela cadastrada";
    
    // Tenta primeiro no singular /tela/{id} que é o padrão estrito do FastAPI, depois em /telas/{id}
    const urlP = id ? `${API_BASE}/tela/${id}` : `${API_BASE}/telas/`;
    const urlA = id ? `${API_BASE}/telas/${id}` : `${API_BASE}/tela/`;
    const method = id ? "PUT" : "POST";

    try {
        const res = await fetchInteligente(urlP, urlA, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, ativo: true })
        });

        const data = await tratarResposta(res, acaoTexto, true);
        if (data !== null) {
            resetFormTela();
            carregarTelas();
        }
    } catch (err) {
        console.error("Erro ao salvar tela:", err);
    }
}

function preencherEditarTela(t) {
    document.getElementById("tla-id").value = t.id_telas || t.id;
    document.getElementById("tla-nome").value = t.nome || "";
    document.getElementById("tla-titulo-form").innerText = "Editar Tela";
}

function resetFormTela() {
    document.getElementById("form-tela").reset();
    document.getElementById("tla-id").value = "";
    document.getElementById("tla-titulo-form").innerText = "Cadastrar Tela";
}

async function inativarTela(t) {
    const idTela = t.id_telas || t.id;
    const isAtivo = t.ativo !== false;
    const acao = isAtivo ? "inativar" : "ativar";
    if (!confirm(`Deseja realmente ${acao} esta tela?`)) return;

    try {
        const res = await fetchInteligente(
            `${API_BASE}/tela/${idTela}`,
            `${API_BASE}/telas/${idTela}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome: t.nome, ativo: !isAtivo })
            }
        );

        const data = await tratarResposta(res, `${acao} tela`, true);
        if (data !== null) carregarTelas();
    } catch (err) {
        console.error(`Erro ao ${acao} tela:`, err);
    }
}

/**
 * Função para excluir uma tela no sistema Q.C Software
 * @param {number|string|object} param - ID da tela (id_telas) ou objeto da tela
 */
async function excluirTela(param) {
    // 1. Extrai o ID da tela correto
    const idTela = (typeof param === 'object' && param !== null) 
        ? (param.id_telas || param.id) 
        : param;

    if (!idTela) {
        alert("⚠️ Erro: Não foi possível identificar o ID da tela para exclusão.");
        return;
    }

    if (!confirm(`Deseja realmente excluir a tela ID ${idTela}?`)) {
        return;
    }

    const url = `https://qcsoftware2.onrender.com/tela/${idTela}`;

    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            let msgErro = "";
            try {
                const jsonErro = await response.json();
                msgErro = jsonErro.detail || jsonErro.message || "";
            } catch (e) {
                msgErro = await response.text();
            }

            if (response.status === 500) {
                throw new Error(
                    `Erro 500 no Banco de Dados:\n` +
                    `Existem linhas cadastradas na tabela de permissões com 'id_telas = ${idTela}'.\n` +
                    `Mesmo desmarcadas (false), as linhas precisam ser removidas do banco de dados antes da tela.`
                );
            }

            throw new Error(msgErro || `Erro ${response.status} ao excluir.`);
        }

        alert("✅ Tela excluída com sucesso!");

        // Recarrega a tabela de telas na interface
        if (typeof carregarTelas === 'function') {
            carregarTelas();
        }

    } catch (error) {
        console.error("Erro ao excluir tela:", error);
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            alert(
                `⚠️ Erro de Banco de Dados ao excluir a Tela ID ${idTela}.\n\n` +
                `A tabela de permissões ainda possui registros apontando para esta tela (mesmo estando desativadas/false).\n\n` +
                `Ajuste a rota DELETE na API para remover as permissões vinculadas antes do commit.`
            );
        } else {
            alert(error.message);
        }
    }
}

// --- PERMISSÕES MATRIZ ---
async function carregarSelectPerfisPermissoes() {
    try {
        // Usa a URL direta para evitar redirecionamento HTTP -> HTTPS
        const res = await fetch(`${API_BASE}/perfis/`);
        
        if (!res.ok) {
            throw new Error(`Erro na requisição: ${res.status}`);
        }

        const perfis = await res.json();
        const select = document.getElementById("perm-perfil");
        
        let optionsHTML = `<option value="">Selecione um perfil...</option>`;
        
        if (Array.isArray(perfis)) {
            perfis.forEach(p => {
                if (p.ativo !== false) {
                    optionsHTML += `<option value="${p.id_perfis}">${p.nome}</option>`;
                }
            });
        }
        
        select.innerHTML = optionsHTML;
        document.getElementById("tbl-permissoes-matriz").innerHTML = "";
    } catch (err) {
        console.error("Erro ao carregar lista de perfis:", err);
    }
}

function criarBtnPermissao(classe, ativo) {
    const isAtivo = Boolean(ativo);
    const cor = isAtivo 
        ? 'text-emerald-600 bg-emerald-50 border-emerald-300' 
        : 'text-red-500 bg-red-50 border-red-200';
    const icone = isAtivo ? 'bi-check-lg' : 'bi-x-lg';

    return `
        <button type="button" 
                data-ativo="${isAtivo}" 
                onclick="alternarStatusPermissao(this)" 
                class="${classe} border px-2 py-1 rounded text-base font-bold shadow-sm transition-all cursor-pointer ${cor}">
            <i class="bi ${icone}"></i>
        </button>
    `;
}

function alternarStatusPermissao(btn) {
    const estaAtivo = btn.getAttribute("data-ativo") === "true";
    const novoEstado = !estaAtivo;
    
    btn.setAttribute("data-ativo", novoEstado);
    
    if (novoEstado) {
        btn.className = btn.className.replace(/text-red-500 bg-red-50 border-red-200/g, 'text-emerald-600 bg-emerald-50 border-emerald-300');
        btn.innerHTML = `<i class="bi bi-check-lg"></i>`;
    } else {
        btn.className = btn.className.replace(/text-emerald-600 bg-emerald-50 border-emerald-300/g, 'text-red-500 bg-red-50 border-red-200');
        btn.innerHTML = `<i class="bi bi-x-lg"></i>`;
    }
}

async function carregarPermissoesMatriz() {
    const idPerfil = document.getElementById("perm-perfil").value;
    if (!idPerfil) {
        document.getElementById("tbl-permissoes-matriz").innerHTML = "";
        return;
    }

try {
        // Busca telas e a lista geral de permissões simultaneamente
        const [resTelas, resPerms] = await Promise.all([
            fetch(`${API_BASE}/tela`),
            fetch(`${API_BASE}/permissoes/`).catch(() => fetch(`${API_BASE}/permissoes`))
        ]);

        const telas = await resTelas.json();
        const permissoes = await resPerms.json();

        const tbody = document.getElementById("tbl-permissoes-matriz");
        tbody.innerHTML = "";

        if (!Array.isArray(telas)) return;

        telas.forEach(t => {
            if (t.ativo !== false) {
                const idTela = t.id_telas || t.id;
                const perm = Array.isArray(permissoes) 
                    ? (permissoes.find(p => (p.id_telas || p.id_tela) === idTela) || {}) 
                    : {};

                tbody.innerHTML += `
                    <tr class="border-b hover:bg-slate-50" data-id-tela="${idTela}">
                        <td class="p-2 border font-medium text-slate-800">${t.nome}</td>
                        <td class="p-2 border text-center">${criarBtnPermissao('chk-vis', perm.visualizar)}</td>
                        <td class="p-2 border text-center">${criarBtnPermissao('chk-ins', perm.inserir)}</td>
                        <td class="p-2 border text-center">${criarBtnPermissao('chk-alt', perm.alterar)}</td>
                        <td class="p-2 border text-center">${criarBtnPermissao('chk-exc', perm.excluir)}</td>
                    </tr>
                `;
            }
        });
    } catch (err) {
        console.error("Erro ao montar matriz de permissões:", err);
    }
}

// 1. Função para Alternar o Ícone do Checkbox ao Clicar
function toggleCheckbox(btn) {
    const atual = btn.getAttribute("data-ativo") === "true";
    const novo = !atual;
    btn.setAttribute("data-ativo", novo ? "true" : "false");

    const icon = btn.querySelector("i");
    if (icon) {
        if (novo) {
            icon.className = "bi bi-check-square-fill text-emerald-600 text-xl";
        } else {
            icon.className = "bi bi-square text-slate-300 text-xl";
        }
    }
}

// 2. Carrega as permissões sem duplicar telas e montando os ícones clicáveis
async function carregarPermissoesMatriz() {
    const idPerfil = parseInt(document.getElementById("perm-perfil")?.value);
    const tbody = document.getElementById("tbl-permissoes-matriz");
    if (!tbody) return;

    tbody.innerHTML = ""; // Limpa a tabela

    if (!idPerfil) return;

    try {
        const res = await fetch(`${API_BASE}/permissoes/`);
        if (!res.ok) {
            console.error("Erro na busca de permissões:", res.status);
            return;
        }

        const todosDados = await res.json();
        if (!Array.isArray(todosDados)) return;

        // Filtra pelo perfil selecionado
        const permissoesPerfil = todosDados.filter(p => p.id_perfis === idPerfil);

        // Remove duplicatas mantendo apenas a permissão mais recente para cada id_telas
        const mapaTelas = new Map();
        permissoesPerfil.forEach(p => {
            // Como os IDs novos são maiores, o map guarda o último/mais recente id_permissoes
            if (!mapaTelas.has(p.id_telas) || p.id_permissoes > mapaTelas.get(p.id_telas).id_permissoes) {
                mapaTelas.set(p.id_telas, p);
            }
        });

        const permissoesUnicas = Array.from(mapaTelas.values());

        // Monta a tabela na DOM com os ícones e eventos de clique
        permissoesUnicas.forEach(p => {
            const tr = document.createElement("tr");
            tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors";

            // IDs necessários para o PUT
            tr.setAttribute("data-id-tela", p.id_telas);
            tr.setAttribute("data-id-permissao", p.id_permissoes || p.id);

            // Mapeamento dos nomes de tela
            const nomesTelas = {
                50: "Ocorrencias",
                51: "Produtos",
                52: "Maquinas",
                53: "Colaboradores"
            };
            const nomeTela = p.nome_tela || nomesTelas[p.id_telas] || `Tela ${p.id_telas}`;

            tr.innerHTML = `
                <td class="p-3 border-r font-medium text-slate-700">${nomeTela}</td>
                <td class="p-3 border-r text-center">
                    <button type="button" class="chk-vis cursor-pointer p-1 rounded hover:bg-slate-100 transition-colors" data-ativo="${!!p.visualizar}" onclick="toggleCheckbox(this)">
                        <i class="bi ${p.visualizar ? 'bi-check-square-fill text-emerald-600' : 'bi-square text-slate-300'} text-xl"></i>
                    </button>
                </td>
                <td class="p-3 border-r text-center">
                    <button type="button" class="chk-ins cursor-pointer p-1 rounded hover:bg-slate-100 transition-colors" data-ativo="${!!p.inserir}" onclick="toggleCheckbox(this)">
                        <i class="bi ${p.inserir ? 'bi-check-square-fill text-emerald-600' : 'bi-square text-slate-300'} text-xl"></i>
                    </button>
                </td>
                <td class="p-3 border-r text-center">
                    <button type="button" class="chk-alt cursor-pointer p-1 rounded hover:bg-slate-100 transition-colors" data-ativo="${!!p.alterar}" onclick="toggleCheckbox(this)">
                        <i class="bi ${p.alterar ? 'bi-check-square-fill text-emerald-600' : 'bi-square text-slate-300'} text-xl"></i>
                    </button>
                </td>
                <td class="p-3 text-center">
                    <button type="button" class="chk-exc cursor-pointer p-1 rounded hover:bg-slate-100 transition-colors" data-ativo="${!!p.excluir}" onclick="toggleCheckbox(this)">
                        <i class="bi ${p.excluir ? 'bi-check-square-fill text-emerald-600' : 'bi-square text-slate-300'} text-xl"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro ao carregar matriz de permissões:", err);
    }
}

// 3. Salva via PUT reutilizando o id_permissoes da linha
async function salvarPermissoesMatriz(e) {
    e.preventDefault();
    
    const idPerfil = parseInt(document.getElementById("perm-perfil")?.value);
    if (!idPerfil) {
        alert("Selecione um perfil primeiro!");
        return;
    }

    const linhas = document.querySelectorAll("#tbl-permissoes-matriz tr");
    let comSucesso = true;
    let totalProcessados = 0;

    for (const row of linhas) {
        const idTelaAttr = row.getAttribute("data-id-tela");
        const idPermissaoAttr = row.getAttribute("data-id-permissao");
        
        if (!idTelaAttr) continue;

        const id_telas = parseInt(idTelaAttr);
        const idPermissao = idPermissaoAttr ? parseInt(idPermissaoAttr) : null;

        if (isNaN(id_telas)) continue;

        const visualizar = row.querySelector(".chk-vis")?.getAttribute("data-ativo") === "true";
        const inserir = row.querySelector(".chk-ins")?.getAttribute("data-ativo") === "true";
        const alterar = row.querySelector(".chk-alt")?.getAttribute("data-ativo") === "true";
        const excluir = row.querySelector(".chk-exc")?.getAttribute("data-ativo") === "true";

        const payload = {
            id_perfis: idPerfil,
            id_telas: id_telas,
            visualizar: visualizar,
            inserir: inserir,
            alterar: alterar,
            excluir: excluir
        };

        try {
            let res;
            if (idPermissao && !isNaN(idPermissao)) {
                payload.id = idPermissao;
                res = await fetch(`${API_BASE}/permissoes/${idPermissao}`, {
                    method: "PUT",
                    headers: { 
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`${API_BASE}/permissoes/`, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) {
                comSucesso = false;
                if (typeof tratarResposta === "function") {
                    await tratarResposta(res, `salvar permissão da tela ${id_telas}`);
                }
                break;
            }
            totalProcessados++;
        } catch (err) {
            console.error("Erro ao salvar permissão:", err);
            comSucesso = false;
            alert("Erro de conexão com o servidor.");
            break;
        }
    }

    if (comSucesso && totalProcessados > 0) {
        alert("Permissões salvas com sucesso!");
        await carregarPermissoesMatriz(); // Recarrega para manter IDs sincronizados
    }
}