/**
 * OpenTelemetry tracing setup for agent service
 * Provides distributed tracing for Stellar RPC, OpenAI API, and database queries
 */

import { trace } from '@opentelemetry/api';
import { NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

export function initializeTracing(serviceName: string = 'neurowealth-agent') {
  const resource = defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    })
  );

  // Configure Jaeger exporter
  const jaegerExporter = new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:4318/v1/traces',
  });

  const provider = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(jaegerExporter)],
  });
  provider.register();

  // Register instrumentations
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation(),
    ],
  });

  console.log(`OpenTelemetry tracing initialized for ${serviceName}`);
  return trace.getTracer(serviceName);
}

export const tracer = initializeTracing();
