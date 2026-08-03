module "vpc" {
  source              = "./../modules/vpc"
  project_name        = var.project_name
  vpc_cidr            = var.vpc_cidr
  public_sub_1_cidr   = var.public_sub_1_cidr
  public_sub_2_cidr   = var.public_sub_2_cidr
  private_sub_1a_cidr = var.private_sub_1a_cidr
  private_sub_2a_cidr = var.private_sub_2a_cidr
}

module "nat" {
  source            = "./../modules/nat"
  project_name      = var.project_name
  vpc_id            = module.vpc.vpc_id
  public_sub_2_id   = module.vpc.public_sub_2_id
  private_sub_1a_id = module.vpc.private_sub_1a_id
  private_sub_2a_id = module.vpc.private_sub_2a_id
  igw_id            = module.vpc.igw_id
}

module "security_group" {
  source       = "./../modules/security_group"
  project_name = var.project_name
  vpc_id       = module.vpc.vpc_id
}

module "ALB" {
  source            = "./../modules/ALB"
  project_name      = var.project_name
  vpc_id            = module.vpc.vpc_id
  public_sub_1_id   = module.vpc.public_sub_1_id
  public_sub_2_id   = module.vpc.public_sub_2_id
  external_lb_sg_id = module.security_group.external_lb_sg_id
}

module "asg" {
  source                = "./../modules/asg"
  project_name          = var.project_name
  private_sub_1a_id     = module.vpc.private_sub_1a_id
  private_sub_2a_id     = module.vpc.private_sub_2a_id
  private_servers_sg    = module.security_group.private_servers_sg_id
  app_tg_arn            = module.ALB.app_tg_arn
  instance_profile_name = module.IAM.instance_profile_name
}
