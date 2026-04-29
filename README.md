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
- Notificaciones por correo electrónico ante contratos vencidos o por vencer

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
| `id`        | `String` (UUID)       | Identificador único             |
| `name`      | `String`              | Nombre del área                 |
| `status`    | `status_area_type`    | `active` / `inactive`           |
| `created_at`| `DateTime`            | Fecha de creación                |
| `updated_at`| `DateTime`            | Última actualización             |

### `positions`
Cargo laboral con soporte de jerarquía padre-hijo para reflejar el organigrama.

| Campo                | Tipo                    | Descripción                              |
|----------------------|-------------------------|------------------------------------------|
| `id`                 | `String` (UUID)         | Identificador único                      |
| `name`               | `String`                | Nombre del cargo                         |
| `area_id`            | `String`                | Área a la que pertenece                  |
| `parent_position_id` | `String?`               | Cargo superior en la jerarquía (nullable)|
| `status`             | `status_position_type`  | `active` / `inactive`                    |

### `contracts`
Contrato laboral de un empleado con trazabilidad completa de estado.

| Campo           | Tipo                    | Descripción                                  |
|-----------------|-------------------------|----------------------------------------------|
| `id`            | `String` (UUID)         | Identificador único                          |
| `employee_id`   | `String`                | Referencia al empleado                       |
| `type`          | `contract_type_enum`    | Tipo de contrato (6 tipos disponibles)       |
| `status`        | `contract_status_enum`  | `valid` / `expired` / `renewed` / `annulled` |
| `start_date`    | `DateTime`              | Fecha de inicio                              |
| `end_date`      | `DateTime`              | Fecha de vencimiento                         |
| `pdf_url`       | `String?`               | URL del documento PDF en Cloudinary          |
| `renewed_from`  | `String?`               | ID del contrato original al renovar          |

**Tipos de contrato disponibles:** término fijo, término indefinido, prestación de servicios, aprendizaje, temporal, obra o labor.

---

## Mensajes NATS (API Interna)

Todos los mensajes se envían con el patrón `{ cmd: '<accion>' }`.

### Áreas

| `cmd`           | Payload                          | Descripción                    |
|-----------------|----------------------------------|--------------------------------|
| `createArea`    | `CreateAreaDto`                  | Crear área                     |
| `findAllAreas`  | `PaginationDto`                  | Listar áreas con paginación    |
| `findOneArea`   | `{ id: string }`                 | Obtener área por ID            |
| `updateArea`    | `{ id: string } & UpdateAreaDto` | Actualizar área                |
| `removeArea`    | `{ id: string }`                 | Eliminar área (soft delete)    |

### Cargos

| `cmd`                    | Payload                               | Descripción                            |
|--------------------------|---------------------------------------|----------------------------------------|
| `createPosition`         | `CreatePositionDto`                   | Crear cargo                            |
| `findAllPositions`       | `PaginationDto`                       | Listar cargos con paginación           |
| `findOnePosition`        | `{ id: string }`                      | Obtener cargo por ID                   |
| `updatePosition`         | `{ id: string } & UpdatePositionDto`  | Actualizar cargo                       |
| `removePosition`         | `{ id: string }`                      | Eliminar cargo                         |
| `positionsTree`          | —                                     | Obtener árbol jerárquico completo      |
| `removePositionHierarchy`| `{ id: string }`                      | Eliminar cargo y toda su descendencia  |

### Contratos

| `cmd`                      | Payload                                  | Descripción                                  |
|----------------------------|------------------------------------------|----------------------------------------------|
| `createContract`           | `CreateContractDto`                      | Crear contrato                               |
| `createContractWithPdf`    | `CreateContractPdfDto`                   | Crear contrato con carga de PDF a Cloudinary |
| `findAllContracts`         | `PaginationDto`                          | Listar contratos con paginación              |
| `findOneContract`          | `{ id: string }`                         | Obtener contrato por ID                      |
| `findContractsByEmployee`  | `{ employeeId: string }`                 | Listar contratos de un empleado              |
| `updateContract`           | `{ id: string } & UpdateContractDto`     | Actualizar contrato                          |
| `renewContract`            | `{ id: string } & RenewContractDto`      | Renovar contrato (crea uno nuevo y marca el anterior como `renewed`) |
| `removeContract`           | `{ id: string }`                         | Eliminar contrato                            |

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
│   │   └── update-position.dto.ts
│   └── enum/
│       └── status_position.enum.ts
├── contracts/
│   ├── contracts.controller.ts     # MessagePatterns de contratos
│   ├── contracts.service.ts        # Lógica + cron de vencimiento
│   ├── contracts.module.ts
│   ├── dto/
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
