output "external_lb_sg_id" {
  value = aws_security_group.external_lb_sg.id
}

output "private_servers_sg_id" {
  value = aws_security_group.private_servers.id
}
