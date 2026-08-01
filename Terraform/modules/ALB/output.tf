output "app_tg_arn" {
  value = aws_lb_target_group.app_tg.arn
}

output "alb_dns_name" {
  value = aws_lb.external_alb.dns_name
}
