// 先定义数据类型
export interface PathInfo {
	id: string
	name: string
	type: number
}

export interface OrgInfo {
	id: string
	name: string
	type: number
	order: number
	path: PathInfo[]
}

export interface JsonUser {
	id: string
	name: string
	avatar: string
	employeeId: string
	deptId: string
	dutyName: string
	state: number
	isExecutive: number
	type: number
	companyId: string
	orgsInfo: OrgInfo[]
	portrait_big_url: string
	mobile: string
	star: boolean
	isFriend: boolean
}
