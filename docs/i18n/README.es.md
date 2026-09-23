<p align="center">
  <a href="https://reevesagents.mertkayacs.com">
    <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/reevesagents"><img src="https://img.shields.io/npm/v/reevesagents.svg" alt="npm version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/reevesagents.svg" alt="node" /></a>
  <a href="../../LICENSE"><img src="https://img.shields.io/npm/l/reevesagents.svg" alt="license" /></a>
  <a href="https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI" alt="CI" /></a>
</p>

<p align="center">
  <a href="https://reevesagents.mertkayacs.com/demo"><b>Demo</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/docs"><b>Documentación</b></a> ·
  <a href="https://reevesagents.mertkayacs.com/faq"><b>Preguntas frecuentes</b></a> ·
  <a href="https://github.com/mertkayacs/reevesagents/issues"><b>Issues</b></a>
</p>

[English](../../README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Español** · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

ReevesAgents es un espacio de trabajo local para CLIs de programación con IA.
Ejecuta Claude Code, Codex, OpenCode, Hermes, Kimi, DeepSeek, Qwen, Pi, Aider y
otras CLIs de proveedor lado a lado en tmux. Puedes usarlo como una CLI, TUI o
Web UI normal, o adjuntar su MCP opcional para que un agente pueda generar, leer,
dirigir y detener al resto.

El inicio de sesión de cada proveedor se queda en su propia CLI. ReevesAgents guarda su estado
en unos pocos archivos JSON bajo `~/.reeves` y solo se ejecuta mientras lo usas tú o una CLI
adjunta.

## Inicio rápido

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

Inicia un run desde la CLI:

```sh
reevesagents spawn claude-code:lead codex:tests hermes:research \
  --name "release check" \
  --prompt "Review the release path, test coverage, and docs."
```

Abre la Web UI:

```sh
reevesagents web
```

Deja que un agente adjunto dirija a los demás:

```sh
reevesagents attach codex
reevesagents hosts
```

Reinicia esa CLI después de `attach` para que cargue las herramientas del MCP.

## Qué te ofrece

| Superficie | Para qué sirve |
| --- | --- |
| **TUI** | Control de los runs desde el teclado, dentro de la terminal. |
| **Web UI** | Vista visual local de runs, paneles, agentes, aprobaciones e historial. |
| **CLI** | Scripts, comprobaciones rápidas, generar agentes, limpiar el estado y saltar a tmux. |
| **MCP de Control de agentes** | Una CLI de confianza puede generar y dirigir otras CLIs mediante herramientas locales. |
| **tmux** | Ventanas con las CLIs reales de cada proveedor, que siguen en marcha al cerrar la UI. |

ReevesAgents es local por diseño. El estado es JSON plano bajo `~/.reeves`, y las
CLIs que arranca son las mismas que ya usas a mano.

<a id="install"></a>
<details>
<summary><strong>Instalación</strong></summary>

ReevesAgents necesita Node.js `20.19+`, tmux `3.0+` y al menos una CLI de
proveedor compatible, instalada y con la sesión iniciada. Funciona en macOS,
Linux y WSL.

```sh
# Homebrew
brew tap mertkayacs/reevesagents
brew install reevesagents

# pnpm
pnpm add -g reevesagents

# npm
npm install -g reevesagents

# one-shot checks
pnpm dlx reevesagents doctor
npx reevesagents doctor
```

Para fijar una versión, sustituye `<version>`:

```sh
pnpm add -g reevesagents@<version>
```

Instalación desde el código fuente:

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
```

</details>

<a id="screenshots"></a>
<details>
<summary><strong>Capturas de pantalla</strong></summary>

La TUI y la Web UI dirigen los mismos runs locales:

![ReevesAgents TUI: selector de idioma, menú de bienvenida y doctor](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: runs y paneles de agentes en vivo](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-es.png)

![ReevesAgents Web UI: inicio de un run nuevo](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-es.png)

</details>

<a id="commands"></a>
<details>
<summary><strong>Comandos</strong></summary>

Sin argumentos, se abre la TUI.

| Comando | Para qué sirve |
| --- | --- |
| `reevesagents` | Abre la TUI. |
| `spawn [spec...]` | Inicia un run. Cada especificación tiene la forma `provider[:nickname[:model]]`. |
| `add [spec...]` | Añade agentes al run activo más reciente. |
| `runs` | Lista los runs activos. |
| `agents [run-id]` | Lista los agentes de todos los runs o de uno concreto. |
| `open <id>` | Salta a la ventana de tmux de un run o de un agente. |
| `peek <agent-id>` | Muestra la salida reciente de un agente. |
| `send <agent-id> <text...>` | Pega texto en un agente sin enviarlo. |
| `key <agent-id> <key>` | Envía `enter`, `escape`, flechas, `tab`, `space`, `backspace` o `ctrl-c`. |
| `interrupt <agent-id>` | Envía Ctrl-C a un agente. |
| `stop <run-id>` | Detiene un run. Requiere `--yes` o `ALLOW_DESTRUCTIVE=1`. |
| `kill <agent-id>` | Detiene un agente. Requiere `--yes` o `ALLOW_DESTRUCTIVE=1`. |
| `setup` | Comprobación del primer arranque. `--attach` conecta todas las CLIs anfitrionas instaladas. |
| `doctor` | Comprueba Node, tmux, el estado y las CLIs de proveedor. |
| `web` | Inicia la Web UI, que solo escucha en loopback. |
| `providers` | Lista los ids de proveedor, alias, modelos y disponibilidad. |
| `approvals` | Lista las solicitudes de aprobación pendientes. |
| `approve` / `deny` | Resuelve una solicitud de aprobación. |
| `hosts` | Muestra qué CLIs anfitrionas tienen ReevesAgents adjunto. |
| `attach [cli]` | Conecta el MCP de Control de agentes a una CLI anfitriona o a todas las instaladas. |
| `detach <cli>` | Quita esa conexión MCP de una CLI anfitriona. |
| `skills [action]` | Instala, elimina o inspecciona la skill de ReevesAgents. |
| `mcp` | Inicia el servidor MCP por stdio. Lo ejecutan las CLIs anfitrionas. |
| `config [key] [value]` | Muestra o cambia los ajustes editables. |
| `presets` | Lista los presets de run guardados. |
| `save-preset` | Guarda un run en marcha como preset. |
| `start-preset` | Inicia un run a partir de un preset. |
| `delete-preset` | Elimina un preset. |
| `delete` | Elimina el registro de un agente terminado. Pide confirmación. |
| `delete-run` | Elimina un run terminado y lo archiva. Pide confirmación. |
| `history` | Lista los runs archivados. |
| `delete-history` | Elimina un registro del historial. Pide confirmación. |
| `reap` | Termina los agentes zombi y los que superan `max_lifetime_ms`, y mata las sesiones de tmux huérfanas que ningún registro de run reclama. |

Flags habituales:

- `--json`: disponible en los comandos de listado y de acción pensados para scripts.
- `--name <name>`: da nombre a un run.
- `--cwd <dir>`: ejecuta los agentes desde un directorio.
- `--prompt <text>`: pega un texto inicial en cada agente generado.
- `--skip`: omite los avisos de permisos del proveedor, para trabajadores desatendidos.
- `--run <run-id>`: añade agentes a un run concreto.
- `--port <n>` y `--no-open`: opciones de arranque de la Web UI.

</details>

<a id="agent-control"></a>
<details>
<summary><strong>Control de agentes</strong></summary>

El Control de agentes es un servidor MCP opcional. Adjúntalo solo a una CLI en la
que confíes para manejar herramientas locales:

```sh
reevesagents attach claude
reevesagents hosts
```

Tras reiniciarla, esa CLI recibe herramientas para `spawn`, `read`, `send_text`,
`send_key`, `interrupt`, `kill` y `stop`, además de otras para gestionar
aprobaciones y presets e inspeccionar anfitriones. El catálogo de proveedores
también se expone como `reevesagents://providers`.

Por defecto, los trabajadores no reciben el MCP. Si un trabajador debe crear sus
propios trabajadores, adjunta ReevesAgents de forma explícita a la CLI de ese
trabajador.

Codex ejecuta las llamadas MCP en un sandbox por defecto, y eso bloquea los
arranques en tmux. Si usas Codex como anfitrión que dirige agentes, ejecútalo con
acceso completo, por ejemplo `codex --sandbox danger-full-access`, o usa un
perfil de Codex que fije `sandbox_mode = "danger-full-access"`.

Referencia completa de herramientas: [docs/mcp.md](../mcp.md). Guía del operador
pensada para agentes: [AGENTS.es.md](../../AGENTS.es.md).

</details>

<a id="configuration"></a>
<details>
<summary><strong>Configuración</strong></summary>

El estado vive bajo `~/.reeves`:

```text
~/.reeves/
  config.json
  presets/
  runs/
  history/
```

Dos variables de entorno cambian las rutas por defecto:

- `REEVES_REGISTRY`: raíz alternativa del estado para `runs/`, `history/` y `presets/`.
- `REEVES_CONFIG`: ruta alternativa del archivo de configuración.

Un registro por servidor de tmux: la limpieza de huérfanos en segundo plano
decide a quién pertenece cada sesión según el registro actual, así que dos
registros nunca deben compartir el mismo servidor de tmux.

Todo lo que pueda contener un secreto se limpia antes de llegar a un archivo.

</details>

<a id="examples"></a>
<details>
<summary><strong>Ejemplos</strong></summary>

Reparte un proyecto entre varias CLIs:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" \
  --prompt "Backend, product copy, and a review pass."
```

Observa un agente y luego abre su ventana:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Detén el run cuando el trabajo esté hecho:

```sh
reevesagents stop "feature x" --yes
```

</details>

<a id="web-ui"></a>
<details>
<summary><strong>Web UI</strong></summary>

```sh
reevesagents web
```

La Web UI escucha solo en `127.0.0.1` y se ejecuta en primer plano. Los agentes
siguen en marcha cuando cierras la página, porque viven en tmux.

La Web UI usa dos módulos opcionales en tiempo de ejecución, `ws` y
`@lydell/node-pty`, que npm instala por defecto. Los comandos de la CLI y la TUI
funcionan igual sin ellos, y `reevesagents web` explica qué falta.

Para llegar a ella desde otra máquina, reenvía el puerto de loopback por SSH:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
```

</details>

<a id="troubleshooting"></a>
<details>
<summary><strong>Resolución de problemas</strong></summary>

**tmux no está instalado.** Instala tmux y ejecuta `reevesagents doctor`. La TUI
se envuelve sola en una sesión de tmux llamada `reeves`; define
`REEVES_NO_TMUX_WRAPPER=1` para desactivarlo.

**Falta una CLI de proveedor o no tiene la sesión iniciada.** ReevesAgents lanza
las CLIs de proveedor que ya están en el `PATH` y autenticadas. `reevesagents doctor`
muestra lo que detecta. Si una ventana recién lanzada está esperando en el inicio
de sesión, `peek` te lo enseña.

**La Web UI dice que faltan paquetes.** Reinstala con las dependencias opcionales
activadas y luego ejecuta `reevesagents doctor`.

**El puerto ya está en uso.** `reevesagents web` empieza por el `8080` por defecto.
Si está ocupado, el servidor toma el siguiente puerto libre dentro de un rango
pequeño e imprime la URL.

</details>

<a id="contributing"></a>
<details>
<summary><strong>Contribuir</strong></summary>

La documentación para quienes contribuyen está en [docs/](..). Empieza por
[CONTRIBUTING.md](../../.github/CONTRIBUTING.md), [pruebas](../testing.md) y
[publicación de versiones](../releasing.md).

Para usar ReevesAgents no hace falta la cadena de herramientas de desarrollo.
Quienes contribuyen usan pnpm, TypeScript, tsup, Vitest y ESLint desde el
repositorio.

</details>

## Enlaces

- Sitio web: https://reevesagents.mertkayacs.com
- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Registro de cambios: [CHANGELOG.md](../../CHANGELOG.md)
- Licencia: [Apache-2.0](../../LICENSE)
