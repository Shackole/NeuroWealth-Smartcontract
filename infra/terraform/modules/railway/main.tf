# Railway module — project, environments, and agent services.
#
# Creates:
#   - One Railway project
#   - Two environments: production, staging
#   - Two Railway services: neurowealth-agent-production, neurowealth-agent-staging

resource "railway_project" "neurowealth" {
  name        = var.project_name
  description = "NeuroWealth AI-powered DeFi yield platform — agent backend"
}

resource "railway_environment" "production" {
  name       = "production"
  project_id = railway_project.neurowealth.id
}

resource "railway_environment" "staging" {
  name       = "staging"
  project_id = railway_project.neurowealth.id
}

resource "railway_service" "agent_production" {
  name       = "${var.project_name}-agent-production"
  project_id = railway_project.neurowealth.id

  source_repo = var.repo_url
}

resource "railway_service" "agent_staging" {
  name       = "${var.project_name}-agent-staging"
  project_id = railway_project.neurowealth.id

  source_repo = var.repo_url
}
