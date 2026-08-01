# Fetch latest Amazon Linux 2023 AMI dynamically
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Launch Template for App Tier EC2s
resource "aws_launch_template" "app_tier" {
  name_prefix            = "${var.project_name}-app-"
  image_id               = var.ami != "" ? var.ami : data.aws_ami.amazon_linux.id
  instance_type          = var.cpu
  vpc_security_group_ids = [var.private_servers_sg]

  user_data = base64encode(<<-EOF
              #!/bin/bash
              echo "Hello World from ${var.project_name}!" > index.html
              python3 -m http.server 80 &
              EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project_name}-app-instance"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Auto Scaling Group managing EC2 instances across 2 private subnets
resource "aws_autoscaling_group" "app_asg" {
  name_prefix         = "${var.project_name}-asg-"
  desired_capacity    = var.desired_capacity
  min_size            = var.min_size
  max_size            = var.max_size
  vpc_zone_identifier = [
    var.private_sub_1a_id,
    var.private_sub_2a_id
  ]

  launch_template {
    id      = aws_launch_template.app_tier.id
    version = "$Latest"
  }

  target_group_arns         = [var.app_tg_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 200
  default_instance_warmup   = 60
  termination_policies      = ["OldestInstance"]

  tag {
    key                 = "Name"
    value               = "${var.project_name}-app-instance"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
  }
}
