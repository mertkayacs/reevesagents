# AGENTS.md

[English](AGENTS.md) · [Deutsch](AGENTS.de.md) · [Français](AGENTS.fr.md) · **Español** · [Português](AGENTS.pt.md) · [Italiano](AGENTS.it.md) · [Türkçe](AGENTS.tr.md) · [Русский](AGENTS.ru.md) · [简体中文](AGENTS.zh-Hans.md) · [العربية](AGENTS.ar.md)

Cómo un agente de codificación de IA dirige ReevesAgents. Este archivo es la guía
del operador de la herramienta misma. No cambia cómo se comportan los agentes en
tus propios proyectos.

ReevesAgents ejecuta CLI de codificación de IA (Claude Code, Codex, Kimi, Qwen,
OpenCode, Hermes y otros) lado a lado, cada uno como una CLI real en su propia
ventana tmux. Un agente puede generar, dirigir y supervisar al resto. El estado
vive en JSON local bajo `~/.reeves`. Sin claves de API, sin base de datos, sin
demonio en segundo plano.

## Dos formas de usarlo

1. **Dirigir la CLI directamente.** Ejecuta `reevesagents spawn ...` para iniciar
   agentes, luego `runs`, `peek`, `send` y `stop` para observar y dirigirlos.
   Bueno para scripts y orquestación única.
2. **Dejar que tu CLI anfitriona dirija a otros sobre MCP.** `reevesagents attach
   <cli>` le da a esa CLI un conjunto de herramientas de control de agentes
   (spawn, send_text, read, kill, ...). Después de reiniciar la CLI, una única
   sesión puede generar un equipo y dirigirlo. Esta es la característica
   principal. Consulta [docs/mcp.md](docs/mcp.md).

## Comprobación de configuración primero

```sh
reevesagents doctor
```

Informa de tmux, Node, el directorio de estado `~/.reeves` y qué CLI de
proveedores están instaladas y son compatibles con la CLI (inspecciona el
`--help` de cada CLI). No puede probar si una CLI ha iniciado sesión, así que
una CLI instalada pero sin sesión aún pasa aquí. Ejecútalo antes de generar
agentes para que una ejecución no falle en una CLI faltante; `peek` (abajo)
detecta una ventana atascada en una pantalla de inicio de sesión. `reevesagents
doctor --json` devuelve lo mismo como JSON legible por máquina.

Requisitos: Node 20.19+, tmux 3.0+ y al menos una CLI de proveedor instalada y
autenticada. macOS, Linux o WSL (Windows nativo no es el objetivo).

## Instalar

```sh
pnpm add -g reevesagents     # o: npm install -g reevesagents
```

Ejecución sin instalación: `pnpm dlx reevesagents doctor`.

## Generar agentes

Cada agente se escribe como `provider[:nickname[:model]]`; nickname y model son
opcionales. El primer agente lidera la ejecución; el resto se unen como
trabajadores.

```sh
# Un líder Claude Code, un segundo revisor Claude Code, dos trabajadores Codex, un trabajador Kimi.
reevesagents spawn cc:lead cc:review codex:api codex:tests kimi:docs \
  --name "feature x" --skip \
  --prompt "Build feature X. Lead coordinates; each worker takes a slice."
```

Antes de empezar cualquier cosa, `spawn` verifica que toda CLI de proveedor
nombrada esté en PATH y nombra las que faltan, de modo que un error tipográfico
o una CLI no instalada falla rápidamente en lugar de iniciar medio una ejecución.
Al tener éxito imprime el id de ejecución, el id de cada agente y los comandos
exactos `peek`/`send`/`open` para dirigirlos.

Flags útiles de `spawn`: `--name <run>`, `--cwd <dir>` (por defecto el
directorio actual), `--prompt <text>` (pegado en cada agente al iniciar),
`--skip` (lanza agentes sin sus propios avisos de permiso; úsalo cuando nadie
esté presente para aprobar), `--run <run-id>` (añade agentes a una ejecución
existente en lugar de iniciar una nueva), `--json` (imprime los ids de ejecución
y agente como JSON en lugar de texto).

## IDs de proveedor y aliases

Ejecuta `reevesagents providers` (añade `--json` para una lista de máquina).
Cualquier alias funciona como el proveedor en una especificación de spawn.

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
reevesagents runs                      # listar ejecuciones vivas (añade --json para scripts)
reevesagents agents <run-id>           # listar los agentes en una ejecución
reevesagents peek <agent-id> -n 40     # salida reciente de un agente
reevesagents send <agent-id> "do X"    # pegar texto en el prompt del agente
reevesagents key <agent-id> enter      # enviar (send no envía por su cuenta)
reevesagents interrupt <agent-id>      # ctrl-c al agente
reevesagents open <run-id|agent-id>    # saltar a su ventana tmux
```

`send` solo pega; síguelo con `key <agent-id> enter` para enviar. Teclas
aceptadas por `key`: `enter`, `escape`, `backspace`, `tab`, `space`, `up`,
`down`, `left`, `right`, `ctrl-c`.

## Detener limpiamente

```sh
reevesagents stop <run-id> --yes       # terminar una ejecución completa y desmontar su sesión tmux
reevesagents kill <agent-id> --yes     # terminar un agente
```

`stop` y `kill` son los únicos comandos destructivos, así que se niegan a
ejecutarse sin `--yes`.

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

# 3. spawn imprime cada id de agente. Listar todos, o leer uno.
reevesagents agents <run-id>
reevesagents peek <agent-id> -n 40

# 4. Dirigir: pegar un mensaje, luego enviarlo.
reevesagents send <agent-id> "rebase on main, then run the tests"
reevesagents key  <agent-id> enter

# 5. Añadir un trabajador a la misma ejecución más tarde.
reevesagents spawn codex:perf --run <run-id> --skip --prompt "profile the hot path"

# 6. Terminar la ejecución cuando esté hecho.
reevesagents stop <run-id> --yes
```

Dirigirlo desde una CLI anfitriona sobre MCP en lugar de el shell, el mismo
escenario es una instrucción: "Usar reevesagents para iniciar un equipo, un
líder Claude Code, un segundo revisor Claude Code, dos trabajadores Codex (api
y tests) y un trabajador Kimi para docs. Omitir avisos de permiso, darles el
brief, luego observar e informar progreso." La anfitriona llama a las
herramientas spawn/read/send ella misma. Consulta [docs/mcp.md](docs/mcp.md).

## Qué hacer y qué no

Qué hacer:

- Ejecuta `doctor` antes de un spawn y asegúrate de que cada proveedor que
  nombres esté instalado **e iniciado sesión**. doctor no puede probar el inicio
  de sesión; si una ventana se atasca, `peek` muestra la pantalla de inicio de
  sesión.
- Trata `spawn` como lanzar y olvidar. Devuelve ids, no respuestas. Sondea con
  `runs`, `agents <run-id>` y `peek <agent-id> -n 40` para ver qué está
  haciendo un equipo.
- Enviar entrada en dos pasos: `send <agent-id> "..."` pega, `key <agent-id>
  enter` envía.
- Pasa `--skip` cuando nadie esté presente para aprobar prompts, o los
  trabajadores se atascen en el primero.
- Usa `--json` (en `spawn`, `runs`, `agents`, `providers`, `doctor`) cuando un
  script o un agente necesite leer ids y estado en lugar de texto.
- Nombra proveedores por id o cualquier alias de `reevesagents providers`
  (`cc` o `claude`, `codex`, `kimi`, ...).

Qué no hacer:

- No esperes que `spawn` devuelva el resultado de un agente; iniciar el equipo,
  luego leerlo.
- No `send` y asumir que se ejecutó; nada se envía hasta que hagas `key
  <agent-id> enter`.
- No generes un proveedor que falta o sin sesión; spawn rechaza el primero y el
  segundo deja una ventana aparcada en un prompt de inicio de sesión que nunca
  hace el trabajo.
- No ejecutes `stop` o `kill` sin `--yes`; son los únicos comandos destructivos.
- No apuntes a Windows nativo; ejecuta dentro de WSL con tmux y las CLI
  instaladas allí.
- No pegues secretos en un `--prompt` o `send`; la salida es capturada y mostrada
  a través de `peek` y la UI web.

## Notas de scripting

- `spawn`, `runs`, `agents`, `providers` y `doctor` todos aceptan `--json`.
- `spawn --json` imprime el id de ejecución y cada id de agente; capturar esos, o
  leerlos de vuelta desde `runs --json` y `agents <run-id> --json`.
- Anular el directorio de estado con `REEVES_REGISTRY` y el archivo de
  configuración con `REEVES_CONFIG` para mantener una ejecución con script
  aislada de `~/.reeves`.

## Más

- [README](README.es.md): gira completa de características y cada comando.
- [docs/GUIDE.md](docs/GUIDE.es.md): guía de usuario paso a paso.
- [docs/mcp.md](docs/mcp.md): el diseño de Agent control y la lista de herramientas.
