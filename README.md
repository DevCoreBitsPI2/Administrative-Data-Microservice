# Administrative Data Microservice

Microservicio responsable de la gestión de la estructura organizacional: **áreas**, **cargos** y **contratos** de empleados. Se comunica exclusivamente a través de NATS como broker de mensajes.

## Tabla de Contenidos

- [Administrative Data Microservice](#administrative-data-microservice)
  - [Tabla de Contenidos](#tabla-de-contenidos)
  - [Descripción General](#descripción-general)
  - [Arquitectura y Módulos](#arquitectura-y-módulos)
  - [Modelos de Base de Datos](#modelos-de-base-de-datos)
    - [`areas`](#areas)
    - [`positions`](#positions)
    - [`contracts`](#contracts)
  - [Mensajes NATS (API Interna)](#mensajes-nats-api-interna)
    - [Áreas](#áreas)
    - [Cargos](#cargos)
    - [Contratos](#contratos)
  - [Variables de Entorno](#variables-de-entorno)
  - [Instalación y Ejecución](#instalación-y-ejecución)
    - [Modo desarrollo (local)](#modo-desarrollo-local)
    - [Modo Docker (recomendado)](#modo-docker-recomendado)
      - [Esto no es necesario si se quiere ejecutar todo el proyecto desde el launcher: **Leer README.md del launcher**](#esto-no-es-necesario-si-se-quiere-ejecutar-todo-el-proyecto-desde-el-launcher-leer-readmemd-del-launcher)
    - [Migraciones de base de datos](#migraciones-de-base-de-datos)
  - [Estructura del Proyecto](#estructura-del-proyecto)
  - [Integraciones Externas](#integraciones-externas)

---

## Descripción General

Este microservicio gestiona los datos administrativos de la organización. Provee operaciones CRUD para áreas departamentales, cargos con soporte de jerarquía (organigrama), y contratos laborales con ciclo de vida completo (emisión, renovación, expiración, anulación).

**Características destacadas:**
- Gestión jerárquica de cargos con detección de referencias circulares
- Carga y gestión de contratos en PDF vía Cloudinary
- Tarea programada diaria (1:00 AM) para verificar contratos próximos a vencer
- Notificaciones por correo electrónico ante contratos próximos a vencer
- Listados paginados con DTOs de filtro específicos por entidad
- Estadísticas agregadas de contratos para tableros administrativos

---

## Arquitectura y Módulos

```
AppModule
├── AreasModule       → CRUD de áreas organizacionales
├── PositionsModule   → CRUD de cargos con estructura jerárquica
└── ContractsModule   → CRUD de contratos + renovación + cron de vencimiento
```

Cada módulo sigue el patrón estándar de NestJS:
`Controller (MessagePattern) → Service → Prisma (PostgreSQL)`

---

## Modelos de Base de Datos

### `areas`
Representa una unidad organizacional (departamento, equipo, etc.).

| Campo       | Tipo                  | Descripción                     |
|-------------|-----------------------|---------------------------------|
| `id_area`   | `Int`                 | Identificador único             |
| `name`      | `String`              | Nombre del área                 |
| `description` | `String`           | Descripción del área            |
| `id_administrator` | `Int`         | Administrador que creó el área  |
| `status`    | `status_area_type`    | `active` / `inactive`           |
| `created_at`| `DateTime`            | Fecha de creación                |

Los listados de áreas incluyen `_count.positions` para exponer cuántos cargos pertenecen al área.

### `positions`
Cargo laboral con soporte de jerarquía padre-hijo para reflejar el organigrama.

| Campo                | Tipo                    | Descripción                              |
|----------------------|-------------------------|------------------------------------------|
| `id_position`        | `Int`                   | Identificador único                      |
| `name`               | `String`                | Nombre del cargo                         |
| `base_salary`        | `Float?`                | Salario base opcional                    |
| `description`        | `String`                | Descripción del cargo                    |
| `id_administrator`   | `Int`                   | Administrador que creó el cargo          |
| `id_area`            | `Int`                   | Área a la que pertenece                  |
| `parent_position_id` | `Int?`                  | Cargo superior en la jerarquía (nullable)|
| `vacancies`          | `Int`                   | Vacantes disponibles                     |
| `status`             | `status_position_type`  | `active` / `inactive`                    |

### `contracts`
Contrato laboral de un empleado con trazabilidad completa de estado.

| Campo           | Tipo                    | Descripción                                  |
|-----------------|-------------------------|----------------------------------------------|
| `id_contract`   | `Int`                   | Identificador único                          |
| `conditions`    | `String`                | Condiciones del contrato                     |
| `contract_type` | `contract_type_enum`    | Tipo de contrato (6 tipos disponibles)       |
| `status`        | `contract_status_enum`  | `valid` / `expired` / `renewed` / `annulled` |
| `start_date`    | `DateTime`              | Fecha de inicio                              |
| `end_date`      | `DateTime`              | Fecha de vencimiento                         |
| `pdf_document`  | `String`                | URL del documento PDF en Cloudinary          |
| `public_id`     | `String?`               | Public ID del archivo en Cloudinary          |
| `id_employee`   | `Int`                   | Referencia al empleado                       |
| `id_manager`    | `Int`                   | Referencia al manager responsable            |
| `expires_soon_notified_at` | `DateTime?`   | Fecha en que se notificó vencimiento próximo |

**Tipos de contrato disponibles:** término fijo, término indefinido, prestación de servicios, aprendizaje, temporal, obra o labor.

---

## Mensajes NATS (API Interna)

Todos los mensajes se envían con el patrón `{ cmd: '<accion>' }`.

### Áreas

| `cmd`           | Payload                          | Descripción                    |
|-----------------|----------------------------------|--------------------------------|
| `createArea`    | `CreateAreaDto`                  | Crear área                     |
| `findAllAreas`  | `AreaPaginationDto`              | Listar áreas con paginación y filtros |
| `findOneArea`   | `number`                         | Obtener área por ID            |
| `updateArea`    | `{ id: number } & UpdateAreaDto` | Actualizar área                |
| `removeArea`    | `number`                         | Desactivar área (soft delete)  |

Filtros de `AreaPaginationDto`:
- `page`, `limit`
- `status`: `active` | `inactive`
- `search`: busca en `name` y `description`

### Cargos

| `cmd`                    | Payload                                  | Descripción                            |
|--------------------------|------------------------------------------|----------------------------------------|
| `createPosition`         | `CreatePositionDto`                      | Crear cargo                            |
| `findAllPositions`       | `PositionPaginationDto`                  | Listar cargos con paginación y filtros |
| `findOnePosition`        | `number`                                 | Obtener cargo por ID                   |
| `updatePosition`         | `{ id: number } & UpdatePositionDto`     | Actualizar cargo                       |
| `removePosition`         | `number`                                 | Desactivar cargo (soft delete)         |
| `positionsTree`          | `{}`                                     | Obtener árbol jerárquico completo      |
| `removePositionHierarchy`| `number`                                 | Desvincular un cargo de su padre       |

Filtros de `PositionPaginationDto`:
- `page`, `limit`
- `status`: `active` | `inactive`
- `id_area`
- `parent_position_id`
- `search`: busca en `name` y `description`

### Contratos

| `cmd`                      | Payload                                  | Descripción                                  |
|----------------------------|------------------------------------------|----------------------------------------------|
| `createContract`           | `CreateContractWithPdfDto`               | Crear contrato con carga de PDF a Cloudinary |
| `findAllContracts`         | `ContractPaginationDto`                  | Listar contratos con paginación y filtros    |
| `findOneContract`          | `number`                                 | Obtener contrato por ID                      |
| `getContractStats`         | `{}`                                     | Obtener estadísticas agregadas de contratos  |
| `findContractsByEmployee`  | `number`                                 | Listar contratos de un empleado              |
| `updateContract`           | `{ id: number } & UpdateContractDto`     | Actualizar contrato                          |
| `renewContract`            | `{ id: number } & RenewContractDto`      | Renovar contrato (crea uno nuevo y marca el anterior como `renewed`) |
| `removeContract`           | `number`                                 | Eliminar contrato                            |

Filtros de `ContractPaginationDto`:
- `page`, `limit`
- `status`: `valid` | `expired` | `renewed` | `annulled`
- `contract_type`: uno de los tipos de contrato soportados
- `id_employee`
- `id_manager`
- `startDate`: filtra `start_date >= startDate`
- `endDate`: filtra `end_date <= endDate`
- `search`: busca en `conditions`

Reglas de negocio de contratos:
- `createContract` valida que `endDate` sea posterior a `startDate`.
- `createContract` y `updateContract` rechazan solapamientos con contratos activos del mismo empleado.
- Si `contractStatus` no llega en creación, se respeta el default de base de datos (`valid`).
- `updateContract` no permite modificar contratos `expired`, `renewed` o `annulled`.
- `renewContract` solo permite renovar contratos `valid`.

---

## Variables de Entorno

| Variable               | Descripción                                         |
|------------------------|-----------------------------------------------------|
| `PORT`                 | Puerto interno del microservicio (default: `3001`)  |
| `NATS_SERVERS`         | URL del servidor NATS (ej: `nats://nats-server:4222`) |
| `DATABASE_URL`         | Cadena de conexión PostgreSQL (Supabase)            |
| `CLOUDINARY_NAME`      | Cloud name de Cloudinary                            |
| `CLOUDINARY_API_KEY`   | API Key de Cloudinary                               |
| `CLOUDINARY_API_SECRET`| API Secret de Cloudinary                           |
| `RESEND_API_KEY`       | API Key del servicio de correo Resend               |
| `EMAIL_FROM`           | Nombre del remitente de correos                     |
| `EMAIL_FROM_ADDRESS`   | Dirección de correo del remitente                   |

---

## Instalación y Ejecución

### Modo desarrollo (local)

```bash
npm install
npm run start:dev
```

### Modo Docker (recomendado)

#### Esto no es necesario si se quiere ejecutar todo el proyecto desde el launcher: **Leer README.md del launcher**

```bash
# Desde la raíz del launcher
docker compose up administrative-data-ms
```

### Migraciones de base de datos

```bash
npx prisma db pull
npx prisma generate
```

---

## Estructura del Proyecto

```
src/
├── main.ts                         # Bootstrap como microservicio NATS
├── app.module.ts                   # Módulo raíz
├── areas/
│   ├── areas.controller.ts         # MessagePatterns de áreas
│   ├── areas.service.ts            # Lógica de negocio
│   ├── areas.module.ts
│   ├── dto/
│   │   ├── area-pagination.dto.ts
│   │   ├── create-area.dto.ts
│   │   └── update-area.dto.ts
│   └── enum/
│       └── status_area.enum.ts
├── positions/
│   ├── positions.controller.ts     # MessagePatterns de cargos
│   ├── positions.service.ts        # Lógica + detección de ciclos en jerarquía
│   ├── positions.module.ts
│   ├── dto/
│   │   ├── create-position.dto.ts
│   │   ├── position-pagination.dto.ts
│   │   └── update-position.dto.ts
│   └── enum/
│       └── status_position.enum.ts
├── contracts/
│   ├── contracts.controller.ts     # MessagePatterns de contratos
│   ├── contracts.service.ts        # Lógica + cron de vencimiento
│   ├── contracts.module.ts
│   ├── dto/
│   │   ├── contract-pagination.dto.ts
│   │   ├── create-contract.dto.ts
│   │   ├── create-contract-pdf.dto.ts
│   │   ├── update-contract.dto.ts
│   │   └── renew-contract.dto.ts
│   └── enum/
│       ├── contract_status.enum.ts
│       └── contract_type.enum.ts
├── lib/
│   ├── prismaService/prisma.ts     # PrismaClient con adaptador pg
│   ├── imageProvider/
│   │   ├── cloudinary.provider.ts  # Configuración de Cloudinary v2
│   │   └── cloudinary-response.ts
│   └── email/
│       ├── email.ts                # Servicio de correo via Resend
│       ├── email.types.ts
│       └── templates/              # Plantillas HTML de correos
├── config/
│   ├── envs.ts                     # Validación de variables de entorno (Joi)
│   ├── index.ts
│   └── services.ts                 # Constante NATS_SERVICE
├── transports/
│   └── nats.module.ts              # ClientsModule NATS
└── common/
    ├── dto/pagination.dto.ts
    ├── exceptions/rpc-custom-exception.filter.ts
    └── index.ts
```

---

## Integraciones Externas

| Servicio      | Uso                                                              |
|---------------|------------------------------------------------------------------|
| **Cloudinary**| Almacenamiento de PDFs de contratos. Se usa la SDK v2.           |
| **Resend**    | Envío de correos de notificación para contratos próximos a vencer.|
| **Supabase**  | Hosting de la base de datos PostgreSQL.                          |
| **NATS**      | Transporte de mensajería inter-microservicios.                   |
