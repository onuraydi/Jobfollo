import type { Workflow } from "../types.js";
import blankJson from "./blank.json";
import freelanceClientOutreachJson from "./freelance-client-outreach.json";
import grantScholarshipJson from "./grant-scholarship.json";
import jobApplicationNetworkingJson from "./job-application-networking.json";

export const jobApplicationNetworking = jobApplicationNetworkingJson as Workflow;
export const freelanceClientOutreach = freelanceClientOutreachJson as Workflow;
export const grantScholarship = grantScholarshipJson as Workflow;
export const blankWorkflow = blankJson as Workflow;

export const builtInTemplates: readonly Workflow[] = [
  jobApplicationNetworking,
  freelanceClientOutreach,
  grantScholarship,
  blankWorkflow,
];
