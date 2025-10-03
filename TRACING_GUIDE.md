# OpenTelemetry Tracing Guide for d-scan.space

This guide explains how to use the enhanced OpenTelemetry tracing system in d-scan.space, leveraging both custom tracing utilities and SvelteKit's new experimental observability features.

## Overview

The tracing system provides:

- **Automatic instrumentation** for SvelteKit hooks, load functions, and form actions
- **Custom span creation** for business logic and database operations
- **SvelteKit integration** with access to request context and routing information
- **Production-ready configuration** with retry logic and performance optimization

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Functions](#core-functions)
3. [withSpan Function](#withspan-function)
4. [SvelteKit Integration](#sveltekit-integration)
5. [Creating Subspans](#creating-subspans)
6. [Best Practices](#best-practices)
7. [Examples](#examples)

## Quick Start

Import the tracing utilities in your server-side code:

```javascript
import { withSpan, addAttributes, addEvent } from '$lib/server/tracer';
```

## Core Functions

### `withSpan(name, fn, attributes, options, event)`

The primary function for creating traced operations with automatic error handling and SvelteKit integration.

**Parameters:**

- `name` (string): The name of the span
- `fn` (Function): The function to execute within the span context
- `attributes` (Object, optional): Key-value pairs to add as span attributes
- `options` (Object, optional): OpenTelemetry span options
- `event` (RequestEvent, optional): SvelteKit request event for context

**Returns:** Promise resolving to the function's result

### `addAttributes(attributes, event)`

Add attributes to the current active span.

**Parameters:**

- `attributes` (Object): Key-value pairs to add
- `event` (RequestEvent, optional): SvelteKit request event

### `addEvent(name, attributes, event)`

Add an event to the current active span.

**Parameters:**

- `name` (string): Event name
- `attributes` (Object, optional): Event attributes
- `event` (RequestEvent, optional): SvelteKit request event

### `createSpan(name, attributes, options)`

Create a span manually for advanced use cases.

**Parameters:**

- `name` (string): The span name
- `attributes` (Object, optional): Initial attributes
- `options` (Object, optional): Span options

**Returns:** Span object (remember to call `span.end()`)

## withSpan Function

The `withSpan` function is the recommended way to create traced operations. It provides:

- **Automatic span lifecycle management** (start/end)
- **Error handling and recording**
- **SvelteKit redirect detection**
- **Context propagation**
- **Performance measurement**

### Basic Usage

```javascript
import { withSpan } from '$lib/server/tracer';

export async function someOperation() {
	return await withSpan('database.query.users', async (span) => {
		// Your business logic here
		const users = await db.query.users.findMany();

		// Optional: Add dynamic attributes
		span.setAttributes({
			'users.count': users.length,
			'query.table': 'users'
		});

		return users;
	});
}
```

### With Initial Attributes

```javascript
export async function getUserById(userId) {
	return await withSpan(
		'database.query.user_by_id',
		async (span) => {
			const user = await db.query.users.findFirst({
				where: eq(users.id, userId)
			});

			span.setAttributes({
				'user.found': !!user,
				'query.result_count': user ? 1 : 0
			});

			return user;
		},
		{
			'user.id': userId,
			'operation.type': 'read'
		}
	);
}
```

## SvelteKit Integration

When using tracing in SvelteKit load functions or form actions, pass the `event` parameter to enable automatic route and request context:

### In Load Functions

```javascript
// src/routes/users/+page.server.js
import { withSpan } from '$lib/server/tracer';

export async function load(event) {
	return await withSpan(
		'page.load.users',
		async (span) => {
			const users = await getUsersList();

			span.setAttributes({
				'users.count': users.length
			});

			return {
				users
			};
		},
		{
			'page.name': 'users_list'
		},
		{}, // options
		event // SvelteKit event for context
	);
}
```

### In Form Actions

```javascript
// src/routes/users/+page.server.js
import { withSpan } from '$lib/server/tracer';

export const actions = {
	create: async (event) => {
		const { request } = event;
		const formData = await request.formData();

		return await withSpan(
			'form.action.create_user',
			async (span) => {
				const userData = {
					name: formData.get('name'),
					email: formData.get('email')
				};

				const user = await createUser(userData);

				span.setAttributes({
					'user.created_id': user.id,
					'form.fields_count': formData.size
				});

				return { success: true, user };
			},
			{
				'action.name': 'create_user',
				'form.method': 'POST'
			},
			{},
			event
		);
	}
};
```

## Creating Subspans

Create nested spans to trace complex operations with multiple steps:

### Sequential Subspans

```javascript
import { withSpan } from '$lib/server/tracer';

export async function processUserRegistration(userData) {
	return await withSpan('user.registration.process', async (parentSpan) => {
		// Step 1: Validate user data
		await withSpan('user.registration.validate', async (span) => {
			const validation = await validateUserData(userData);
			span.setAttributes({
				'validation.success': validation.isValid,
				'validation.errors_count': validation.errors?.length || 0
			});

			if (!validation.isValid) {
				throw new Error('Validation failed');
			}
		});

		// Step 2: Create user in database
		const user = await withSpan('user.registration.create_db', async (span) => {
			const newUser = await db.insert(users).values(userData);
			span.setAttributes({
				'user.id': newUser.id,
				'database.table': 'users'
			});
			return newUser;
		});

		// Step 3: Send welcome email
		await withSpan('user.registration.send_email', async (span) => {
			await sendWelcomeEmail(user.email);
			span.setAttributes({
				'email.type': 'welcome',
				'email.recipient': user.email
			});
		});

		parentSpan.setAttributes({
			'registration.user_id': user.id,
			'registration.steps_completed': 3
		});

		return user;
	});
}
```

### Parallel Subspans

```javascript
export async function loadDashboardData(userId) {
	return await withSpan('dashboard.load_data', async (parentSpan) => {
		// Execute multiple operations in parallel, each with their own span
		const [userProfile, recentScans, statistics] = await Promise.all([
			withSpan('dashboard.load_user_profile', async (span) => {
				const profile = await getUserProfile(userId);
				span.setAttributes({
					'profile.has_avatar': !!profile.avatar,
					'profile.membership_type': profile.membershipType
				});
				return profile;
			}),

			withSpan('dashboard.load_recent_scans', async (span) => {
				const scans = await getRecentScans(userId, 10);
				span.setAttributes({
					'scans.count': scans.length,
					'scans.time_range': '24h'
				});
				return scans;
			}),

			withSpan('dashboard.load_statistics', async (span) => {
				const stats = await getUserStatistics(userId);
				span.setAttributes({
					'stats.total_scans': stats.totalScans,
					'stats.isk_destroyed': stats.iskDestroyed
				});
				return stats;
			})
		]);

		parentSpan.setAttributes({
			'dashboard.user_id': userId,
			'dashboard.components_loaded': 3,
			'dashboard.load_time': Date.now() - parentSpan.startTime
		});

		return {
			userProfile,
			recentScans,
			statistics
		};
	});
}
```

## Best Practices

### 1. Naming Conventions

Use hierarchical, descriptive span names:

- `database.query.users.find_by_id`
- `api.external.eve_esi.character_info`
- `business_logic.scan.process_dscan_data`
- `cache.redis.set_user_session`

### 2. Meaningful Attributes

Add attributes that help with debugging and monitoring:

```javascript
span.setAttributes({
	// Operation details
	'operation.type': 'read',
	'operation.table': 'characters',

	// Performance metrics
	'result.count': results.length,
	'query.duration_ms': queryTime,

	// Business context
	'user.id': userId,
	'character.id': characterId,

	// Error context
	'error.type': 'validation_failed',
	'error.field': 'character_name'
});
```

### 3. Error Handling

The `withSpan` function automatically handles errors, but you can add context:

```javascript
await withSpan('character.fetch_from_esi', async (span) => {
	try {
		const character = await esiClient.getCharacter(characterId);
		return character;
	} catch (error) {
		// Add custom error context
		span.setAttributes({
			'esi.character_id': characterId,
			'esi.error_type': error.constructor.name,
			'esi.response_code': error.response?.status
		});
		throw error; // Re-throw to maintain error flow
	}
});
```

### 4. Database Operations

Trace database operations with relevant context:

```javascript
import { withSpan } from '$lib/server/tracer';
import { db } from '$lib/database/connection';

export async function searchCharacters(query, limit = 20) {
	return await withSpan(
		'database.search.characters',
		async (span) => {
			const startTime = Date.now();

			const results = await db.query.characters.findMany({
				where: ilike(characters.name, `%${query}%`),
				limit
			});

			const duration = Date.now() - startTime;

			span.setAttributes({
				'search.query': query,
				'search.limit': limit,
				'search.results_count': results.length,
				'database.query_duration_ms': duration,
				'database.table': 'characters'
			});

			return results;
		},
		{
			'operation.type': 'search',
			'search.type': 'character_name'
		}
	);
}
```

### 5. External API Calls

Track external service interactions:

```javascript
export async function fetchCharacterFromESI(characterId) {
	return await withSpan('api.esi.character.fetch', async (span) => {
		const url = `https://esi.evetech.net/latest/characters/${characterId}/`;

		span.setAttributes({
			'http.url': url,
			'http.method': 'GET',
			'esi.character_id': characterId
		});

		const response = await fetch(url);

		span.setAttributes({
			'http.response.status_code': response.status,
			'http.response.size': response.headers.get('content-length')
		});

		if (!response.ok) {
			throw new Error(`ESI API error: ${response.status}`);
		}

		const character = await response.json();

		span.setAttributes({
			'esi.character.name': character.name,
			'esi.character.corporation_id': character.corporation_id
		});

		return character;
	});
}
```

## Examples

### Complete Load Function Example

```javascript
// src/routes/characters/[id]/+page.server.js
import { withSpan, addEvent } from '$lib/server/tracer';
import { error } from '@sveltejs/kit';

export async function load(event) {
	const { params } = event;
	const characterId = parseInt(params.id);

	return await withSpan(
		'page.load.character_detail',
		async (span) => {
			span.setAttributes({
				'character.id': characterId,
				'page.type': 'character_detail'
			});

			// Load character data
			const character = await withSpan('character.load.basic_info', async () => {
				const char = await getCharacterById(characterId);
				if (!char) {
					throw error(404, 'Character not found');
				}
				return char;
			});

			// Load related data in parallel
			const [killmails, corporations, recentActivity] = await Promise.all([
				withSpan('character.load.killmails', async (span) => {
					const kills = await getCharacterKillmails(characterId, 50);
					span.setAttributes({
						'killmails.count': kills.length
					});
					return kills;
				}),

				withSpan('character.load.corporation_history', async (span) => {
					const corps = await getCharacterCorporationHistory(characterId);
					span.setAttributes({
						'corporations.count': corps.length
					});
					return corps;
				}),

				withSpan('character.load.recent_activity', async (span) => {
					const activity = await getCharacterRecentActivity(characterId);
					span.setAttributes({
						'activity.events_count': activity.length
					});
					return activity;
				})
			]);

			addEvent(
				'character.data_loaded',
				{
					'character.name': character.name,
					'data.sections': ['basic', 'killmails', 'corporations', 'activity']
				},
				event
			);

			span.setAttributes({
				'character.name': character.name,
				'character.corporation_id': character.corporationId,
				'data.total_killmails': killmails.length,
				'data.corporation_changes': corporations.length
			});

			return {
				character,
				killmails,
				corporations,
				recentActivity
			};
		},
		{
			'route.id': event.route.id,
			'url.pathname': event.url.pathname
		},
		{},
		event
	);
}
```

This tracing system provides comprehensive observability for your d-scan.space application while maintaining clean, readable code. The automatic instrumentation combined with custom spans gives you full visibility into your application's performance and behavior.
