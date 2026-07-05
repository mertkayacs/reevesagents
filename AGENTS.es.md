# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · **Español** · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Cómo un agente de codificación de IA dirige ReevesAgents. Este archivo es la guía
del operador de la propia herramienta. No cambia cómo se comportan los agentes en
tus propios proyectos.

ReevesAgents ejecuta CLI de codificación de IA (Claude Code, Codex, Kimi, Qwen,
OpenCode, Hermes y otras) lado a lado, cada una como una CLI real en su propia
ventana tmux. Un agente puede generar, dirigir y supervisar al resto. El estado
vive en JSON local bajo `~/.reeves`. Sin claves de API, sin base de datos, sin
demonio en segundo plano.

## Dos formas de usarlo

1. **Dirigir la CLI directamente.** Ejecuta `reevesagents spawn ...` para iniciar
   agentes, luego `runs`, `peek`, `send` y `stop` para observarlos y dirigirlos.
   Útil para scripts y orquestación puntual.
2. **Dejar que tu CLI anfitriona dirija a las demás por MCP.**
   `reevesagents attach <cli>` le da a esa CLI un conjunto de herramientas de
   control de agentes
   (spawn, send_text, read, kill, ...). Tras reiniciar la CLI, una única sesión
   puede generar un equipo y dirigirlo. Esta es la característica principal.
   Consulta [docs/mcp.md](docs/mcp.md).

## Primero, comprueba el entorno

```sh
reevesagents doctor
```

Informa de tmux, Node, el directorio de estado `~/.reeves` y qué CLI de proveedor
están instaladas y son compatibles (inspecciona el `--help` de cada una). No puede
comprobar si una CLI tiene la sesión iniciada, así que una CLI instalada pero sin
sesión pasa igualmente. Ejecútalo antes de generar agentes para que un run no
falle por una CLI que falta; `peek` (más abajo) detecta una ventana que se quedó
en la pantalla de inicio de sesión. `reevesagents doctor --json` devuelve lo mismo
como JSON legible por máquina.

Requisitos: Node 20.19+, tmux 3.0+ y al menos una CLI de proveedor instalada y
autenticada. macOS, Linux o WSL (Windows nativo no es un objetivo).

## Instalar

```sh
pnpm add -g reevesagents     # o: npm install -g reevesagents
```

Para usarlo sin instalar: `pnpm dlx reevesagents doctor`.

## Generar agentes

Cada agente se escribe como `provider[:nickname[:model]]`; nickname y model son
opcionales. El primer agente lidera el run; el resto se unen como trabajadores.

```sh
# Un líder Claude Code, un segundo revisor Claude Code, dos trabajadores Codex, un trabajador Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Antes de arrancar nada, `spawn` comprueba que todas las CLI de proveedor nombradas
estén en el PATH y nombra las que faltan, de modo que un error tipográfico o una
CLI sin instalar falla rápido en lugar de dejar un run a medio iniciar. Si todo va
bien, imprime el id del run, el id de cada agente y los comandos exactos
`peek`/`send`/`open` para dirigirlos.

Flags útiles de `spawn`: `--name <run>`, `--cwd <dir>` (por defecto el directorio
actual), `--prompt <text>` (pegado en cada agente al arrancar), `--skip` (lanza
los agentes sin sus propios avisos de permiso; úsalo cuando nadie esté presente
para aprobar), `--run <run-id>` (añade agentes a un run existente en lugar de
iniciar uno nuevo), `--json` (imprime los ids del run y de los agentes como JSON
en lugar de texto).

## IDs de proveedor y aliases

Ejecuta `reevesagents providers` (añade `--json` para una lista legible por
máquina). Cualquier alias funciona como proveedor en una spec de spawn.

| id         | proveedor    | aliases comunes              |
| ---------- | ------------ | ----------------------------- |
| `cc`       | Claude Code  | `claude`, `claude-code`     |
| `codex`    | Codex CLI    | `codex-cli`                 |
| `kimi`     | Kimi Code    | `kimi-code`                 |
| `qwen`     | Qwen Code    | `qwen-code`                 |
| `opencode` | OpenCode CLI | `open_code`                 |
| `hermes`   | Hermes       |                             |
| `pi`       | Pi           |                             |
| `aider`    | Aider        |                             |
| `deepseek` | DeepSeek CLI | `deepseek-cli`              |

## Observar y dirigir agentes en ejecución

```sh
reevesagents runs                      # lista los runs vivos (añade --json para scripts)
reevesagents agents <run-id>           # lista los agentes de un run
reevesagents peek <agent-id> -n 40     # salida reciente de un agente
reevesagents send <agent-id> "do X"    # pega texto en el prompt del agente
reevesagents key <agent-id> enter      # lo envía (send no envía por su cuenta)
reevesagents interrupt <agent-id>      # ctrl-c al agente
reevesagents open <run-id|agent-id>    # salta a su ventana tmux
reevesagents approvals                 # solicitudes de aprobación pendientes (añade --json)
reevesagents approve <approval-id>     # resuelve una; deny <approval-id> la deniega
```

`send` solo pega; síguelo con `key <agent-id> enter` para enviar. Teclas
aceptadas por `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`,
`down`, `left`, `right`, `ctrl-c`.

## Detener limpiamente

```sh
reevesagents stop <run-id> --yes       # termina un run completo y desmonta su sesión tmux
reevesagents kill <agent-id> --yes     # termina un agente
```

`stop` y `kill` se niegan a ejecutarse sin `--yes`. La misma barrera cubre la
limpieza: `delete <agent-id>` y `delete-run <run-id>` eliminan registros
finalizados, y `delete-history <id>` elimina uno archivado.

## Un ejemplo práctico: cinco agentes, luego dirigirlos

El escenario "instalar reevesagents, generar dos Claude, dos Codex y un Kimi, y
ponerlos a trabajar" de principio a fin.

```sh
# 1. Confirmar que las cinco CLI están instaladas y son compatibles.
reevesagents doctor

# 2. Iniciar el equipo. --skip para que los trabajadores no se detengan en sus propios avisos de permiso.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker owns one slice."

# 3. spawn imprime el id de cada agente. Listarlos todos, o leer uno.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Dirigir: pegar un mensaje, luego enviarlo.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Añadir un trabajador al mismo run más tarde.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Terminar el run cuando el trabajo esté hecho.
reevesagents stop <run-id> --yes
```

Si lo diriges desde una CLI anfitriona por MCP en lugar del shell, el mismo
escenario es una sola instrucción: "Usa reevesagents para iniciar un equipo: un
líder Claude Code, un segundo revisor Claude Code, dos trabajadores Codex (api y
tests) y un trabajador Kimi para docs. Omite los avisos de permiso, dales el
brief y luego observa e informa del progreso." La CLI anfitriona llama ella misma
a las herramientas spawn/read/send. Consulta [docs/mcp.md](docs/mcp.md).

## Qué hacer y qué no

Qué hacer:

- Ejecuta `doctor` antes de un spawn y asegúrate de que cada proveedor que
  nombres esté instalado **y con sesión iniciada**. doctor no puede comprobar el
  inicio de sesión; si una ventana se atasca, `peek` muestra la pantalla de
  inicio de sesión.
- Trata `spawn` como lanzar y olvidar. Devuelve ids, no respuestas. Sondea con
  `runs`, `agents <run-id>` y `peek <agent-id> -n 40` para ver qué está haciendo
  el equipo.
- Envía la entrada en dos pasos: `send <agent-id> "..."` pega, `key <agent-id>
  enter` envía.
- Pasa `--skip` cuando nadie vaya a estar presente para aprobar los avisos, o los
  trabajadores se quedarán atascados en el primero.
- Usa `--json` (en `spawn`, `runs`, `agents`, `providers`, `doctor`) cuando un
  script o un agente necesite leer ids y estado en lugar de texto.
- Nombra los proveedores por id o por cualquier alias de `reevesagents providers`
  (`cc` o `claude`, `codex`, `kimi`, ...).

Qué no hacer:

- No esperes que `spawn` te devuelva el resultado de un agente; inicia el equipo
  y luego léelo.
- No hagas `send` y des por hecho que se ejecutó; nada se envía hasta que hagas
  `key <agent-id> enter`.
- No generes un proveedor que falta o que está sin sesión; spawn rechaza el
  primero, y el segundo deja una ventana aparcada en un prompt de inicio de
  sesión que nunca hace el trabajo.
- No ejecutes `stop`, `kill` ni los comandos `delete` sin `--yes`; esos son los
  destructivos.
- No apuntes a Windows nativo; ejecuta dentro de WSL con tmux y las CLI
  instaladas allí.
- No pegues secretos en un `--prompt` ni en `send`; la salida se captura y se
  muestra a través de `peek` y la Web UI.

## Notas de scripting

- `spawn`, `runs`, `agents`, `providers` y `doctor` aceptan todos `--json`.
- `spawn --json` imprime el id del run y el id de cada agente; captúralos, o
  vuelve a leerlos con `runs --json` y `agents <run-id> --json`.
- Anula el directorio de estado con `REEVES_REGISTRY` y el archivo de
  configuración con `REEVES_CONFIG` para mantener un run lanzado por script
  aislado de `~/.reeves`.

## Más

- [README](docs/i18n/README.es.md): recorrido completo por las características y
  todos los comandos.
- [docs/GUIDE.md](docs/GUIDE.es.md): guía del usuario paso a paso.
- [docs/mcp.md](docs/mcp.md): el diseño del MCP de Agent control y la lista de
  herramientas.
