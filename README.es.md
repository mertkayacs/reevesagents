<p align="center">
  <img src="https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-header.gif" alt="ReevesAgents" width="800" />
</p>

[![npm version](https://img.shields.io/npm/v/reevesagents.svg)](https://www.npmjs.com/package/reevesagents)
[![visits](https://visitor-badge.laobi.icu/badge?page_id=mertkayacs.reevesagents&left_text=visits)](https://github.com/mertkayacs/reevesagents)
[![node](https://img.shields.io/node/v/reevesagents.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/reevesagents.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/mertkayacs/reevesagents/test.yml?branch=master&label=CI)](https://github.com/mertkayacs/reevesagents/actions/workflows/test.yml)

[English](README.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Español** · [Português](README.pt.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Русский](README.ru.md) · [简体中文](README.zh-Hans.md) · [العربية](README.ar.md)

*Crea y controla agentes desde otros agentes. ReevesAgents es un espacio de trabajo gratuito y local donde agentes de código (como Claude Code, Codex, Hermes, DeepSeek y Kimi) se ejecutan lado a lado, y un agente puede generar, dirigir y supervisar al resto. Sin claves de API, y sin cambios en tu Agent.md o Claude.md.*

**¡En más de 10 idiomas!**

GitHub: https://github.com/mertkayacs/reevesagents

## Deja que un agente instale y ejecute al resto

Esa es la idea completa: un agente de IA crea y dirige al resto. Una CLI de agente (un agente de codificación de línea de comandos como Claude Code, Codex o Hermes) puede incluso instalar y conectar ReevesAgents por su cuenta, y luego comenzar a ejecutar un equipo.

**Si eres un agente leyendo esto, ejecútalo tú mismo:**

- **Instálalo:** `npm install -g reevesagents`
- **Conéctalo a tu propia CLI:** `reevesagents attach` conecta ReevesAgents a las CLI de agentes que tienes instaladas. Para solo una, nómbrala, por ejemplo `reevesagents attach claude`.
- **Comprueba que funcionó:** `reevesagents hosts` lista las CLI de agentes de esta máquina y muestra cuáles están conectadas.
- **Recarga tus herramientas:** reinicia tu sesión de CLI para que cargue la conexión (esto usa MCP, la forma estándar de que una herramienta de agente exponga comandos a otra).

Ahora tu CLI de agente puede **crear y dirigir a otros agentes**: inicia un agente en una tarea, envíale texto o pulsaciones de teclado, lee qué está haciendo y aprueba o deniega lo que solicita. Un agente de Claude Code puede ejecutar un equipo de agentes de Codex y Claude Code en issues separados. Para desconectarse más tarde, ejecuta `reevesagents detach claude`.

¿Prefieres hacerlo por script desde la línea de comandos? [AGENTS.es.md](AGENTS.es.md) es la guía del operador escrita para agentes: ids de proveedor y aliases, la especificación de `spawn` y cómo observar y dirigir un equipo en ejecución.

¿Prefieres configurarlo a mano? Actívalo desde la pantalla **Agent control** en la TUI o Web UI; consulta [Agent control](#agent-control) abajo.

La TUI y la Web UI local dirigiendo el mismo run:

![ReevesAgents TUI: selector de idioma, pantalla de bienvenida y runs](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-tui.gif)

![ReevesAgents Web UI: runs y paneles de agentes en vivo](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-web-es.png)

![ReevesAgents Web UI: iniciar un nuevo run](https://raw.githubusercontent.com/mertkayacs/reevesagents/master/docs/assets/reevesagents-newrun-es.png)

ReevesAgents es un espacio de trabajo gratuito y de código abierto para agentes de codificación de IA. Ejecuta varios a la vez y deja que un agente cree y dirija a otros: un agente de Claude Code gestionando agentes de Codex y Claude Code en issues separados. Coloca cada agente donde es más fuerte, por ejemplo DeepSeek en el backend, Claude en la dirección de producto y web, Codex en un sistema de diseño o una pasada de implementación, y Hermes en correo, búsqueda o investigación.

La interfaz está disponible en 10 idiomas: inglés, alemán, francés, español,
portugués, italiano, turco, ruso, chino simplificado y árabe.

¿Eres nuevo en ReevesAgents? La [Guía del usuario](docs/GUIDE.es.md) te acompaña
a través de la instalación, tu primer run, y dejar que un agente dirija el
resto.

## Superficies

| Superficie | Para qué sirve |
| --- | --- |
| **TUI** | Control rápido centrado en el teclado dentro del terminal. |
| **Web UI** | Una vista visual de runs, agentes, paneles en vivo e historial. |
| **CLI** | Scripts, comandos rápidos de spawn, comprobaciones con doctor y apertura de tmux. |
| **tmux** | Ventanas reales de las CLI de los proveedores que siguen ejecutándose localmente. |
| **Agent control** | La idea principal: un agente crea y dirige a otros. Lo activas por CLI, y entonces un agente de Claude Code puede ejecutar agentes de Codex, Hermes y Claude Code a la vez. |

## Por qué ReevesAgents

- **Deja que tu agente dirija agentes.** Tu CLI principal (por ejemplo Claude Code) genera y orienta un conjunto de agentes de Claude, Codex, DeepSeek, Hermes, OpenCode u otros mediante MCP.
- **Multitarea y bucles.** Ejecuta varios agentes en paralelo en distintas partes de un proyecto, mantén agentes en bucle y observa todos desde una sola vista. Pon un modelo más barato al frente para enrutar el trabajo a agentes más inteligentes o más pequeños.
- **Mantén el costo práctico.** Deja que modelos baratos o gratuitos escriban código rutinario y pruebas mientras planificas y diseñas con uno más grande, en lugar de hacer pasar todo por un único modelo predeterminado caro.
- **Un solo espacio de trabajo, sin perder el hilo.** Si ya saltas entre Claude, Codex, DeepSeek, Hermes u OpenCode, ReevesAgents reúne esas sesiones en un único lugar local; abre cualquier agente desde la TUI o la Web UI para dirigirlo directamente.
- **Mantén la flexibilidad de proveedor.** El inicio de sesión del proveedor permanece en cada CLI. ReevesAgents nunca almacena credenciales ni hace de proxy del tráfico de los modelos, así que puedes agregar, quitar o cambiar de CLI libremente.
- **Ve el trabajo de un vistazo.** Runs activos, agentes, modelos, modos de permiso, acciones de detener y eliminar, e historial en una sola vista de la Web UI mientras tmux mantiene vivas las CLI reales.

Esto no es una plataforma de agentes en la nube. Es una pequeña capa local
alrededor de CLI reales: sin base de datos, sin Docker, sin demonio en segundo
plano y sin claves de API almacenadas por ReevesAgents.

## Instalación

ReevesAgents se publica en npm como `reevesagents`. Instálalo de forma global con
el gestor de paquetes que ya usas y luego verifica la máquina con `doctor`.

```sh
npm install -g reevesagents
reevesagents doctor
reevesagents
```

Para fijar una versión, añade `@<version>` al nombre del paquete, por ejemplo
`npm install -g reevesagents@1.2.0`.

<details>
<summary><b>pnpm</b></summary>

```sh
pnpm add -g reevesagents
reevesagents doctor
reevesagents
```

De una sola vez, sin instalación global:

```sh
pnpm dlx reevesagents doctor
```

</details>

<details>
<summary><b>Yarn</b></summary>

De una sola vez con Yarn (Berry):

```sh
yarn dlx reevesagents doctor
```

Instalación global con Yarn Classic:

```sh
yarn global add reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Bun</b></summary>

```sh
bun add -g reevesagents
reevesagents doctor
reevesagents
```

De una sola vez, sin instalación global:

```sh
bunx reevesagents doctor
```

</details>

<details>
<summary><b>npx (sin instalación)</b></summary>

```sh
npx reevesagents doctor
```

</details>

<details>
<summary><b>Homebrew</b></summary>

```sh
brew tap mertkayacs/reevesagents
brew install reevesagents
reevesagents doctor
reevesagents
```

</details>

<details>
<summary><b>Desde el código fuente</b></summary>

Usa el código fuente cuando quieras inspeccionar el código, contribuir o ejecutar
desde el repositorio.

```sh
git clone https://github.com/mertkayacs/reevesagents.git
cd reevesagents
pnpm install
pnpm build
pnpm link --global
reevesagents doctor
reevesagents
```

</details>

## Requisitos previos

ReevesAgents es local-first. Espera una máquina de desarrollo normal con tmux y al
menos una CLI de proveedor ya instalada.

- macOS, Linux o WSL. Windows nativo no es el entorno de ejecución objetivo; usa WSL.
- Node.js `20.19+`.
- tmux. Se recomienda la versión `3.0+`.
- Una shell interactiva normal en el `PATH`.
- Al menos una CLI de proveedor compatible en el `PATH`.

ReevesAgents puede lanzar estas CLI de proveedores cuando están instaladas y
autenticadas en tu máquina: Claude Code, Codex CLI, OpenCode, Hermes, Kimi,
DeepSeek, Pi, Qwen y Aider. El inicio de sesión del proveedor, los modelos, las
herramientas, las cuotas y los avisos de permiso permanecen en cada proveedor.
ReevesAgents no almacena las claves de API de los proveedores ni hace de proxy del
tráfico de los modelos.

## Inicio rápido

```sh
reevesagents                 # lanza la TUI
reevesagents web             # abre la Web UI local
reevesagents doctor          # comprueba la máquina
```

Inicia un run con nombre desde la CLI. La primera spec es la principal (lead), el
resto son trabajadores (workers), y cada spec es `provider[:nickname[:model]]`:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:system hermes:research \
  --name "launch week build" \
  --prompt "Plan the backend, product surface, design system, and research notes."
```

Para un recorrido completo, consulta la [Guía del usuario](docs/GUIDE.es.md).

## Comandos

Sin argumentos se lanza la TUI. Los subcomandos son la superficie de operador para
personas y scripts.

| Comando | Propósito | Flags clave |
| --- | --- | --- |
| `reevesagents` | Lanza la TUI (sin subcomando). | ninguno |
| `spawn [spec...]` | Inicia un run con uno o más agentes de proveedor. Cada `spec` es `provider[:nickname[:model]]`. La primera spec es la principal (lead), el resto son trabajadores. Sin spec se usa `codex` por defecto. | `--name <name>` (por defecto `run`), `--cwd <dir>` (por defecto el directorio actual), `--prompt <text>` (pegado en cada agente) |
| `runs` | Lista los runs activos, uno por línea. | `--json` (registros completos de los runs como un array JSON) |
| `open <id>` | Cambia tmux a la ventana Reeves de un run o a una ventana de agente. Dentro de tmux cambia; fuera de tmux en un TTY se conecta; de lo contrario imprime un comando de tmux listo para pegar. Acepta un id/nombre de run o un id/apodo de agente (se permite coincidencia por prefijo). | ninguno |
| `peek <agent-id>` | Imprime la salida reciente de un agente. | `-n, --lines <n>` (por defecto `20`), `--json` (líneas como un array) |
| `stop <run-id>` | Detiene un run. | `-y, --yes` (o `ALLOW_DESTRUCTIVE=1`) |
| `kill <agent-id>` | Detiene un agente. | `-y, --yes` (o `ALLOW_DESTRUCTIVE=1`) |
| `doctor` | Ejecuta comprobaciones de salud del entorno (Node, tmux, ruta de estado, CLI de proveedores). Sale con código distinto de cero ante cualquier comprobación fallida. | `--json` |
| `web` | Inicia la Web UI bajo demanda, solo en loopback. Se ejecuta en primer plano; los agentes siguen ejecutándose después de que la detengas. | `--port <n>` (puerto preferido, recurre al siguiente puerto libre), `--no-open` (no abrir el navegador) |
| `hosts` | Lista las CLI de agentes en esta máquina y muestra cuáles están conectadas a ReevesAgents. | ninguno |
| `attach [cli]` | Conecta ReevesAgents a una CLI de agente, o a todas las instaladas cuando no se da un nombre. Ejecuta el propio `mcp add` de esa CLI. | ninguno |
| `detach <cli>` | Desconecta ReevesAgents de una CLI de agente. Ejecuta el propio `mcp remove` de esa CLI. | ninguno |
| `mcp` | Inicia el servidor MCP de Agent control sobre stdio. No se ejecuta a mano; la CLI a la que lo conectas lo ejecuta. | ninguno |

`stop` y `kill` son los únicos comandos destructivos. Se niegan a ejecutarse sin
`--yes` o `ALLOW_DESTRUCTIVE=1`.

## Agent control

ReevesAgents incluye un servidor MCP opcional que permite a una CLI de IA generar
y dirigir otras CLI de IA: iniciar un agente, pegar un prompt, enviar teclas, leer
la salida y resolver solicitudes de aprobación. Es un mecanismo plano, no una
política de orquestación: sin roles, sin bucles autónomos, sin protocolo de
coordinación.

Está desactivado por defecto. ReevesAgents nunca lo adjunta a una CLI por su
cuenta.

Lo activas desde la pantalla **Agent control** en la TUI o la Web UI. Esa pantalla
lista las CLI de esta máquina que pueden alojar un servidor MCP (claude, codex,
kimi, qwen, opencode, hermes) y te permite adjuntar, separar o adjuntar todas.
Adjuntar ejecuta el propio comando `mcp add` de esa CLI (por ejemplo
`claude mcp add reevesagents -- reevesagents mcp`); separar ejecuta la eliminación
correspondiente. ReevesAgents solo llama al propio comando de cada CLI y nunca
edita a mano los archivos de configuración del proveedor. OpenCode es la
excepción: su `mcp add` es interactivo y no tiene eliminación, así que la pantalla
lo marca como adjuntar-a-mano.

Una vez que una CLI está adjuntada, dispone de las herramientas de Agent Control
cada vez que se inicia. Instalarlo es tu elección explícita, y esa elección es el
consentimiento. Un run es la CLI controladora a la cabeza, más los agentes que
generó, y todo el grupo aparece en la TUI y la Web UI como cualquier otro run.

Los trabajadores generados no reciben el MCP por defecto, así que no pueden
generar más agentes. Para que un trabajador dirija a sus propios subtrabajadores,
adjunta el MCP a la CLI de ese trabajador desde la misma pantalla. Las
salvaguardas se sitúan a nivel de recurso: un límite de agentes por run
(`max_agents`), aplicado cuando la herramienta de spawn agrega un agente a un run, y el hecho
de que cada agente es un proceso de CLI real en su propio panel de tmux.

Una CLI adjuntada también puede descubrir qué puede lanzar: la herramienta
`list_providers` y el recurso `reevesagents://providers` devuelven los proveedores
de esta máquina con sus ids, estado de instalación, alias y modelos conocidos, de
modo que un agente pasa un id real a `spawn` en lugar de adivinar.

Consulta [docs/mcp.md](docs/mcp.md) para el diseño completo y la lista de
herramientas.

## Configuración

El estado y la configuración son JSON local. Sin base de datos, sin demonio.

El estado vive bajo `~/.reeves`:

```text
~/.reeves/
  config.json     ajustes globales (intervalo de peek, idioma, permisos por defecto, límites)
  presets/        preajustes de run guardados
  runs/           una carpeta por run activo (run.json más agents/<id>.json)
  history/        runs finalizados y obsoletos archivados (history/runs/<id>.json)
```

Dos variables de entorno anulan los valores predeterminados, principalmente para
uso de pruebas aisladas o de múltiples perfiles:

- `REEVES_REGISTRY`: anulación de la raíz del estado. Reemplaza `~/.reeves` como el
  directorio para `runs/`, `history/` y `presets/`.
- `REEVES_CONFIG`: anulación de la ruta del archivo de configuración. Reemplaza
  `~/.reeves/config.json`.

Los campos de texto que pueden contener secretos se redactan antes de escribirse en
el estado.

## Ejemplos

Reparte un proyecto entre las CLI que encajan en cada tarea:

```sh
reevesagents spawn deepseek:backend claude-code:product codex:review \
  --name "feature x" --prompt "Backend, product copy, and a review pass."
```

Lista lo que está vivo y obtén el id del run:

```sh
reevesagents runs
reevesagents runs --json   # apto para scripts
```

Observa un solo agente sin salir de tu shell y luego entra en él cuando te
necesite:

```sh
reevesagents peek backend -n 40
reevesagents open backend
```

Cuando el trabajo esté hecho, detén todo el run en una sola llamada:

```sh
reevesagents stop "feature x" --yes
```

## Web UI

La Web UI es local y solo de loopback.

```sh
reevesagents web
```

Se enlaza a `127.0.0.1`, se ejecuta en primer plano y sale cuando la detienes. Los
agentes siguen ejecutándose en tmux después. Desde el navegador puedes crear runs,
añadir agentes, elegir modelos de proveedor y modos de permiso, detener agentes,
eliminar trabajo finalizado e inspeccionar el historial mientras las CLI reales
siguen ejecutándose.

La Web UI usa dos módulos de runtime opcionales, `ws` y `@lydell/node-pty`. npm los
instala por defecto. La CLI y la TUI siguen funcionando sin ellos, y el comando
`web` explica qué falta.

Para llegar a la Web UI desde otra máquina, reenvía el puerto de loopback por SSH.
No hay un túnel integrado:

```sh
ssh -L 8080:127.0.0.1:8080 user@host
# luego abre http://localhost:8080 en el navegador
```

## Resolución de problemas

**tmux no está instalado.** ReevesAgents necesita tmux para la navegación basada
en ventanas. Instálalo (`brew install tmux` o `apt install tmux`) y ejecuta
`reevesagents doctor`. La TUI se envuelve a sí misma automáticamente en una sesión
de tmux llamada `reeves`; define `REEVES_NO_TMUX_WRAPPER=1` para omitir ese
comportamiento.

**Falta una CLI de proveedor o Doctor informa de un fallo.** ReevesAgents solo
lanza CLI de proveedor que ya están en tu `PATH` y autenticadas. Ejecuta
`reevesagents doctor` para ver qué proveedores se detectan y qué está fallando,
luego instala o inicia sesión en la CLI de proveedor que necesites.

**La Web UI informa de paquetes faltantes.** La Web UI necesita `ws` y
`@lydell/node-pty`. Pueden omitirse cuando la plataforma no tiene un binario
precompilado de `@lydell/node-pty` o cuando la instalación omitió las dependencias
opcionales. Reinstala con las dependencias opcionales habilitadas, luego ejecuta
`reevesagents doctor`.

**El puerto ya está en uso.** `reevesagents web` se inicia en el puerto `8080` por
defecto. Si está ocupado, el servidor se enlaza al siguiente puerto libre dentro de
un rango pequeño e imprime la URL elegida. Pasa `--port <n>` para elegir un puerto
de inicio diferente.

## No es necesario

No necesitas claves de API almacenadas por ReevesAgents, una base de datos, Docker,
un servicio en segundo plano ni configuración de MCP para runs de agentes normales
y estables. La instalación es pasiva: el paquete estable no tiene script de
postinstall y no reescribe la configuración del proveedor. Adjuntar el MCP de Agent
Control es el único paso explícito y opcional que toca la configuración del
proveedor, y solo a través del propio comando `mcp add` de cada CLI.

## Contribuir

Consulta [CONTRIBUTING.md](.github/CONTRIBUTING.md) para las ramas y el flujo de
pull requests, [SECURITY.md](.github/SECURITY.md) para reportar vulnerabilidades, y
[CHANGELOG.md](CHANGELOG.md) para los cambios recientes. El modelo de diseño vive en
[REEVESAGENTS_DESIGN.md](docs/REEVESAGENTS_DESIGN.md) y la documentación para
contribuyentes está bajo [docs/](docs).

Los usuarios finales no necesitan la cadena de herramientas de desarrollo. Los
contribuyentes usan pnpm, TypeScript, tsup, Vitest y ESLint del repositorio.

## Enlaces

- npm: https://www.npmjs.com/package/reevesagents
- GitHub: https://github.com/mertkayacs/reevesagents
- Releases: https://github.com/mertkayacs/reevesagents/releases
- Issues: https://github.com/mertkayacs/reevesagents/issues
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Licencia: [Apache-2.0](LICENSE)

## Licencia

Apache-2.0
