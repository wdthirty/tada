// Pipeline Engine
// Processes events through pipelines: Filter → Transform → Output
// MVP: In-memory pipeline storage, direct integration with Ingestion

import type { Pipeline, DecodedEvent, ProgramId } from '@tada/shared';
import { evaluateFilter } from './filter.js';
import { applyTransform, TransformedEvent } from './transform.js';

/**
 * Pipeline Engine
 * Manages pipelines and processes events through them
 */
export class PipelineEngine {
  // In-memory pipeline storage (Supabase will replace this)
  private pipelines: Map<string, Pipeline> = new Map();

  // Index: programId -> pipelineIds
  // For fast lookup of which pipelines care about which programs
  private programIndex: Map<ProgramId, Set<string>> = new Map();

  // Event handler - called when a transformed event is ready for delivery
  private onEvent: ((event: TransformedEvent, pipeline: Pipeline) => void) | null = null;

  // Stats
  private stats = {
    eventsProcessed: 0,
    eventsMatched: 0,
    eventsFiltered: 0,
    errors: 0,
  };

  /**
   * Register an event handler for transformed events
   */
  setEventHandler(handler: (event: TransformedEvent, pipeline: Pipeline) => void) {
    this.onEvent = handler;
  }

  /**
   * Add or update a pipeline
   */
  upsertPipeline(pipeline: Pipeline): void {
    // Remove from old index if updating
    if (this.pipelines.has(pipeline.id)) {
      this.removeFromIndex(pipeline.id);
    }

    this.pipelines.set(pipeline.id, pipeline);
    this.addToIndex(pipeline);

    console.log(`[Engine] Pipeline ${pipeline.id} registered for programs: ${pipeline.programs.join(', ')}`);
  }

  /**
   * Remove a pipeline
   */
  removePipeline(id: string): boolean {
    if (!this.pipelines.has(id)) {
      return false;
    }

    this.removeFromIndex(id);
    this.pipelines.delete(id);

    console.log(`[Engine] Pipeline ${id} removed`);
    return true;
  }

  /**
   * Get a pipeline by ID
   */
  getPipeline(id: string): Pipeline | undefined {
    return this.pipelines.get(id);
  }

  /**
   * Get all pipelines
   */
  getAllPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Get pipelines for a specific program
   */
  getPipelinesForProgram(programId: ProgramId): Pipeline[] {
    const pipelineIds = this.programIndex.get(programId);
    if (!pipelineIds) return [];

    return Array.from(pipelineIds)
      .map(id => this.pipelines.get(id))
      .filter((p): p is Pipeline => p !== undefined && p.status === 'active');
  }

  /**
   * Process a single event through all matching pipelines
   */
  processEvent(event: DecodedEvent): TransformedEvent[] {
    this.stats.eventsProcessed++;

    const matchingPipelines = this.getPipelinesForProgram(event.program);
    if (matchingPipelines.length === 0) {
      return [];
    }

    const results: TransformedEvent[] = [];

    for (const pipeline of matchingPipelines) {
      try {
        // Apply filter
        if (!evaluateFilter(pipeline.filter, event)) {
          this.stats.eventsFiltered++;
          continue;
        }

        this.stats.eventsMatched++;

        // Apply transform
        const transformed = applyTransform(pipeline.transform, event, pipeline.id);
        results.push(transformed);

        // Notify handler
        if (this.onEvent) {
          this.onEvent(transformed, pipeline);
        }
      } catch (error) {
        this.stats.errors++;
        console.error(`[Engine] Error processing event through pipeline ${pipeline.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Process multiple events (batch)
   */
  processEvents(events: DecodedEvent[]): TransformedEvent[] {
    const results: TransformedEvent[] = [];

    for (const event of events) {
      const transformed = this.processEvent(event);
      results.push(...transformed);
    }

    return results;
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      ...this.stats,
      pipelineCount: this.pipelines.size,
      activePipelines: Array.from(this.pipelines.values()).filter(p => p.status === 'active').length,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      eventsProcessed: 0,
      eventsMatched: 0,
      eventsFiltered: 0,
      errors: 0,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  private addToIndex(pipeline: Pipeline): void {
    for (const programId of pipeline.programs) {
      if (!this.programIndex.has(programId)) {
        this.programIndex.set(programId, new Set());
      }
      this.programIndex.get(programId)!.add(pipeline.id);
    }
  }

  private removeFromIndex(pipelineId: string): void {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    for (const programId of pipeline.programs) {
      const pipelineIds = this.programIndex.get(programId);
      if (pipelineIds) {
        pipelineIds.delete(pipelineId);
        if (pipelineIds.size === 0) {
          this.programIndex.delete(programId);
        }
      }
    }
  }
}

// Singleton instance
export const engine = new PipelineEngine();
