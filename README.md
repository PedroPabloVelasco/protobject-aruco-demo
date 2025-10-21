# README — Semáforos coordinados (Protobject + Remote táctil + ArUco opcional)

## 0) ¿Qué es esto?

Prototipo de cruce semaforizado “inteligente” que siempre corre **ciclo normal** (verde → amarillo → todo rojo → alterna), pero **adapta** su comportamiento según la demanda percibida:

* **Extiende** el verde si hay cola significativa.
* **Cambia** antes si el lado opuesto espera demasiado.
* **Pre-emption**: **ambulancia** tiene prioridad absoluta.
* Visualiza **colas en tiempo real** (solo “tiempo de espera”) y registra **récords de espera por tipo** (auto, bici, bus, ambulancia).

Control por **móvil** con `remote.html` (modelo **por eventos**: add/remove/clear), y soporte **opcional** de visión con `aruco.html` (modelo “vision” que caduca si no se vuelve a ver).

---

## 1) Estructura del repo

```
/ (raíz)
├─ index.html         # Escenario principal (semaforización + UI)
├─ remote.html        # Control táctil (móvil): eventos add/remove/clear
├─ config.js          # Configuración de Protobject (páginas)
├─ css/
│  └─ styles.css      # Estilos
└─ js/
   ├─ constants.js    # Tiempos, pesos, umbrales (ajustable)
   ├─ state.js        # Estado global + estadísticas
   ├─ queue.js        # Colas NS/EW (alta/baja, prune, anti-resurrección)
   ├─ scoring.js      # Puntuación por lado (pesos W)
   ├─ decision.js     # Motor de decisión (extend / switch / pre-emption)
   ├─ scheduler.js    # Agenda de “salidas” (4s + 2·i), pop, stats
   ├─ ui.js           # Pintado de luces, banner, colas
   └─ main.js         # Pegamento: recepción de eventos, ciclo base, loops
```

> `aruco.html` puede añadirse (opcional) si deseas detección visual. En `config.js` ya está declarado.

---

## 2) Cómo ejecutar

1. **Abrir index.html** en un navegador moderno (ideal: Chrome/Edge).

   * Protobject (`p.js`) mostrará su botón “Connect”.

2. **Abrir remote.html** en tu **móvil** conectado a la **misma red** (LAN):

   * Usa la misma URL base que `index.html` y cambia el path a `/remote.html`.
   * Ej.: si sirves en `http://192.168.0.10:8080/index.html`, abre `http://192.168.0.10:8080/remote.html` en el teléfono.

3. (Opcional) **aruco.html** para detección con marcadores ArUco.

   * Aporta “detección” que caduca si no se vuelve a ver (no eventos persistentes).

---

## 3) Uso rápido

* **Ciclo normal** corre solo.

* Desde `remote.html`:

  * **Añade** vehículos por carril (NS/EW): `+ auto`, `+ bus`, `+ bici`, `+ ambulancia`.
  * **Quita** el primero de ese tipo en ese lado: `− auto`, `− bus`, etc.
  * **Limpiar todo**: borra las colas.
  * **Peatón** (si lo conectas a la lógica) envía una petición de cruce.

* **Visual principal (index)**:

  * Carretera + 2 semáforos (NS/EW).
  * Al lado de cada semáforo: **cola** con ítems y **solo el tiempo de espera**.
  * En la parte inferior (sección pequeña): **“Máximo de espera observado (NS+EW)”** por tipo (estadística real, no estimación).

---

## 4) Modelo de datos y flujo

### 4.1 Fuentes de “detección”

* **Eventos** (remote): alta/baja persistente.

  * `evt = { type:'add', id, role, dir }` → se encola hasta pasar o hasta `clear/remove`.
  * `evt = { type:'removeOne', role, dir }` → quita el primero de ese tipo/lado.
  * `evt = { type:'clearAll' }` → limpia todas las colas.

* **Visión** (aruco): entradas efímeras (“vision”).

  * `payload.det = { <id>: { role, dir, y } }`
  * Si no se vuelve a ver en `PERSIST_MS`, se **prunea** (sale de cola).

> Para evitar “resurrecciones” si un emisor repite el mismo `id` inmediatamente tras pasar, hay un **TTL anti-resurrección** (2.5 s).

### 4.2 Cola y programación de salidas

* Orden por **prioridad** dentro del **mismo lado** cuando se pone verde:

  1. **Ambulancias primero**, luego FIFO (por `enqueuedAt`).
* **Regla de paso**: el i-ésimo vehículo sale a `t0 + (4 + 2·i)` segundos, con `i = 0,1,2,…`.
* Si llegan vehículos **mientras ya está en verde**, se les **agenda al instante** (en caliente) respetando esa secuencia.

---

## 5) Motor de decisión (resumen)

Parámetros clave en `js/constants.js`:

```js
export const W = { auto:1.0, bici:0.5, bus:6.0, peaton:3.0, ambulancia:1000 };

export const GREEN_BASE = 8;   // verde base por lado (s)
export const YELLOW_TIME = 2;  // amarillo (s)
export const ALL_RED_TIME = 1; // todo rojo (s)
export const MIN_GREEN = 2;    // verde mínimo antes de permitir cambio (s)

export const MAX_EXTEND = 12;      // máximo que puede extender
export const MAX_CONTINUOUS = 40;  // tope de verde continuo
export const MAX_WAIT = 45;        // espera máxima tolerable del opuesto
export const DELTA_EXTEND = 2;     // si score actual supera por ≥2, extiende
export const DELTA_SWITCH = 3;     // si opuesto supera por ≥3, cambia (tras MIN_GREEN)

export const PASS_BASE = { auto:4, bici:4, bus:4, ambulancia:4 }; // base de cruce
export const PASS_HEADWAY = 2; // +2 s por cada vehículo delante
```

**Decisiones**:

* **Pre-emption**: si hay ambulancia en un lado, ese lado pasa primero (o se mantiene extendido).
* **Extensión**: si el score del lado verde supera al opuesto por `DELTA_EXTEND` y no excede `MAX_EXTEND`.
* **Cambio**: si el score del opuesto supera por `DELTA_SWITCH` y ya cumpliste `MIN_GREEN`.
* **Fairness**: si un lado espera `MAX_WAIT` o si el verde alcanza `MAX_CONTINUOUS`, se fuerza cambio.
* **Atajo “lado vacío”**: si el lado verde **no tiene demanda** y el opuesto **sí**, tras `MIN_GREEN` cambiamos.

> **Score** por lado: suma ponderada con `W`. Ambulancia tiene peso muy alto (1000) para “bloquear” la lógica a su favor.

---

## 6) Estadísticas (“Máximo de espera observado”)

* Se registra **cuando un vehículo pasa** (al hacer `shift()` de la cola en `scheduler.js`):
  `espera = now - enqueuedAt` (segundos).
* Se hace `max` por **tipo** en `state.stats.maxWait`:

  ```js
  { auto: <s>, bici: <s>, bus: <s>, ambulancia: <s> }
  ```
* **No se reinicia** automáticamente al limpiar colas: funciona como **récord histórico** de la sesión.
  (Si quieres un botón “Reset stats”, dime y te paso el snippet.)

---

## 7) Personalización rápida

* **Tiempos/umbrales/pesos**: editar `js/constants.js`.
* **Prioridad interna** en el lado:

  * Prioridad absoluta (actual): ambulancia primero, luego FIFO.
  * Para usar **solo orden de llegada**: cambia el sort en `beginGreen(side)`:

    ```js
    arr.sort((a,b)=>a.enqueuedAt - b.enqueuedAt);
    ```
* **Ciclo base**: controlado en `main.js` (intervalo de 300 ms evita quedarse “muerto” en rojo).

---

## 8) Casos de uso

1. **Ciclo normal** (sin entradas): ver alternancia NS ↔ EW con tiempos base.
2. **Cola creciente lado NS**: añadir 3–4 autos; observar **extensión** de NS.
3. **Ambulancia lado EW**: se **pre-empta** EW incluso si NS tenía cola (tras MIN_GREEN).
4. **Llegadas en caliente** (ya en verde): pulsar `+ auto` y ver que se agenda en 6 s, 8 s, etc.
5. **Fairness**: mantener un lado sin demanda y el otro con demanda; ver que tras **MIN_GREEN** cambia.
6. **Estadísticas**: forzar una espera larga (ej. cargar muchos autos en rojo) y comprobar **récord**.

---

## 9) Glosario breve

* **NS / EW**: carriles Norte-Sur / Este-Oeste.
* **phase**: fase actual (`NS_GREEN`, `EW_GREEN`, `YELLOW_NS`, `YELLOW_EW`, `ALL_RED`).
* **enqueuedAt**: instante en que entró a la cola.
* **scheduledOutAt**: instante programado para “pasar” (ser retirado de la cola).
* **extend** / **switch** / **pre-emption**: decisiones del motor.

