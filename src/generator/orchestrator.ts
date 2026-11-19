import type {
  ProjectGenerationPreview,
  ProjectGenerationResult,
  ProjectGeneratorInput,
  ProjectGeneratorServices,
} from './types.js';

export interface ProjectGenerationOptions {
  readonly dryRun?: boolean;
}

export function orchestrateProjectGeneration(
  input: ProjectGeneratorInput,
  services: ProjectGeneratorServices,
  options: ProjectGenerationOptions = {},
): ProjectGenerationResult | ProjectGenerationPreview {
  const validated = services.validate(input);
  const destination = services.planDestination(validated);
  const template = services.selectTemplate(validated, destination);
  const context = { input: validated, destination, template };
  const result = services.generate(context, options);

  if ('dryRun' in result) {
    return result;
  }

  services.install?.(result);
  services.initializeGit?.(result);

  return result;
}
