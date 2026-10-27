import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { GlobalExerciseRecord, GlobalExerciseSeed, SeedResult } from './global-exercise.models';

@Injectable({ providedIn: 'root' })
export class GlobalExerciseAdminService {
  private readonly supabase = inject(SupabaseService).client;

  async load(): Promise<GlobalExerciseRecord[]> {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('id,name,muscle_group,image_url,video_url,description,created_at,updated_at')
      .eq('source', 'global')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => this.mapRecord(row));
  }

  async create(input: GlobalExerciseSeed): Promise<string> {
    const { data, error } = await this.supabase
      .from('exercises')
      .insert(this.toPayload(input))
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async update(id: string, input: GlobalExerciseSeed): Promise<void> {
    const { error } = await this.supabase
      .from('exercises')
      .update({ ...this.toPayload(input), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('source', 'global')
      .select('id')
      .single();
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('exercises')
      .delete()
      .eq('id', id)
      .eq('source', 'global')
      .select('id')
      .single();
    if (error) throw error;
  }

  async addMissing(
    catalog: GlobalExerciseSeed[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<SeedResult> {
    const existing = await this.load();
    const existingNames = new Set(existing.map((exercise) => this.normalizeName(exercise.name)));
    const uniqueCatalog = new Map<string, GlobalExerciseSeed>();
    for (const exercise of catalog) {
      const key = this.normalizeName(exercise.name);
      if (key && !uniqueCatalog.has(key)) uniqueCatalog.set(key, exercise);
    }

    const missing = [...uniqueCatalog.entries()]
      .filter(([name]) => !existingNames.has(name))
      .map(([, exercise]) => exercise);
    const chunkSize = 25;
    let completed = 0;
    onProgress?.(0, missing.length);

    for (let index = 0; index < missing.length; index += chunkSize) {
      const chunk = missing.slice(index, index + chunkSize).map((exercise) => this.toPayload(exercise));
      const { error } = await this.supabase.from('exercises').insert(chunk);
      if (error) throw error;
      completed += chunk.length;
      onProgress?.(completed, missing.length);
    }

    return {
      added: missing.length,
      skipped: uniqueCatalog.size - missing.length,
      total: existing.length + missing.length
    };
  }

  private toPayload(input: GlobalExerciseSeed) {
    return {
      source: 'global' as const,
      coach_id: null,
      name: input.name.trim(),
      muscle_group: input.muscleGroup.trim(),
      image_url: input.imageUrl || null,
      video_url: input.videoUrl?.trim() || null,
      description: input.description?.trim() || null
    };
  }

  private mapRecord(row: Record<string, any>): GlobalExerciseRecord {
    return {
      id: row['id'],
      name: row['name'] || 'Ejercicio sin nombre',
      muscleGroup: row['muscle_group'] || 'Full Body',
      imageUrl: row['image_url'],
      videoUrl: row['video_url'],
      description: row['description'],
      createdAt: row['created_at'],
      updatedAt: row['updated_at']
    };
  }

  private normalizeName(name: string): string {
    return name.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
}
