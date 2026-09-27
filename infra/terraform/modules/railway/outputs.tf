output "project_id" {
  description = "Railway project ID."
  value       = railway_project.neurowealth.id
}

output "staging_service_id" {
  description = "Railway staging agent service ID."
  value       = railway_service.agent_staging.id
}

output "production_service_id" {
  description = "Railway production agent service ID."
  value       = railway_service.agent_production.id
}
